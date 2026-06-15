# Deep Dive: High-Throughput Redis Caching & Distributed Synchronization in .NET 8/9

This document serves as an architectural blueprint and conceptual reference for the transition from legacy backend structures to cloud-native, highly parallelized caching fabrics in .NET.

---

## Module 1: Foundational Infrastructure & Drivers

### The Client vs. Engine Nuance
In cloud-native .NET development, adding a NuGet package driver such as `Microsoft.Extensions.Caching.StackExchangeRedis` does **not** install or execute the database server. It merely provides the asynchronous network translation fabric.

### Local Infrastructure Deployment (Docker)
To avoid environmental pollution and match modern cloud topologies (Kubernetes/ECS), the actual Redis database engine must run inside an isolated runtime container:

```bash
docker run --name ims-redis -p 6379:6379 -d redis:alpine
```

### Visual Inspection Layer
For active memory tracking, key prefix verification, and live command profiling, **Redis Insight** (v3) serves as the graphical management console. 
* Can be deployed via Docker: `docker run -d --name redis-insight -p 5540:5540 redis/redisinsight:latest`
* Accessible natively at: `http://localhost:5540`

---

## Module 2: The Core Cache-Aside Implementation

The **Cache-Aside Pattern** isolates reading paths from writing paths. The system queries the fast L2 cache layer first; on an L2 miss, it cascades to the persistent data store and rehydrates the cache asynchronously.

```
[API Request] ──> Check Redis (L2) ──(Hit)──> Return Data
                       │
                     (Miss)
                       ▼
             Fetch from Database ──> Save to Redis ──> Return Data
```

### High-Performance Serialization Optimization
Standard string-based JSON serialization allocates substantial object footprints on the Managed Heap, potentially driving garbage collection into the **Large Object Heap (LOH)** under load. 

By utilizing `JsonSerializer.SerializeToUtf8Bytes`, objects are compiled directly into a raw `byte[]` payload, completely bypassing string allocation overhead and maximizing throughput.

---

## Module 3: Advanced Architectural Redesign

Centralizing cache orchestration via a generic layer is critical to prevent code duplication, decouple domain logic from infrastructure, and apply uniform concurrency guardrails across all system endpoints.

### Identifying and Fixing Critical Concurrency Vulnerabilities

#### 1. The Cache Stampede (Thundering Herd)
Under heavy cloud traffic, if a core cache key expires, hundreds of concurrent threads will simultaneously experience an L2 cache miss. If unmanaged, all threads will rush to the downstream database at once, causing a cascade failure.

#### 2. The `ConcurrentDictionary` Lifecycle Race Condition
A naive in-process cleanup pattern trying to remove and dispose of inactive semaphores looks like this:

```csharp
// NAIVE ANTI-PATTERN - DO NOT USE
if (semaphore.CurrentCount == 1) {
    KeyLocks.TryRemove(key, out var removed);
    removed?.Dispose(); // Throws ObjectDisposedException for threads entering concurrently
}
```

If Thread A determines a semaphore is idle and triggers `.Dispose()`, any concurrent thread (Thread B) entering the block at that exact microsecond will attempt to await a disposed object, resulting in a fatal `ObjectDisposedException`.

**The Fix:** Introduce an atomic reference-counted wrapper utilizing `Interlocked` operations to safely track multi-threaded leases.

#### 3. High-Allocation Spin-Locks (CPU Thrashing)
A standard polling loop (e.g., repeating a lock request every fixed 100ms) introduces unnecessary latency penalties and network noise. 

**The Fix:** Implement an **exponential back-off with random jitter** to spread out thread retry waves.

#### 4. Optimal Orchestration Ordering
Locks must be prioritized from the least expensive boundary to the most expensive boundary: **In-Process First, Distributed Second**.

```
[Cache Miss] ──> 1. In-Process Lock (SemaphoreSlim)
                          │ (Filters 1000 Local Threads down to 1)
                          ▼
                 2. Distributed Lock (Redis SET NX)
                          │ (Filters Multiple Cloud Server Instances down to 1 Global Winner)
                          ▼
                 3. Query Downstream Database
```

---

## Module 4: Unified Production Implementation

Below is the complete, cohesive source code framework developed throughout this architecture sprint.

### 1. Storage Abstraction (`ICacheService.cs`)
```csharp
using System.Threading;
using System.Threading.Tasks;

namespace IMSWebAPI.Services;

public interface ICacheService
{
    Task<T?> GetAsync<T>(string key, CancellationToken token = default);
    Task SetAsync<T>(string key, T value, TimeSpan? expiration = null, CancellationToken token = default);
}
```

### 2. Distributed Engine Concrete Implementation (`RedisCacheService.cs`)
```csharp
using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Caching.Distributed;

namespace IMSWebAPI.Services;

public sealed class RedisCacheService(IDistributedCache cache) : ICacheService
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public async Task<T?> GetAsync<T>(string key, CancellationToken token = default)
    {
        var cachedData = await cache.GetAsync(key, token).ConfigureAwait(false);

        return cachedData switch
        {
            null or { Length: 0 } => default,
            _ => JsonSerializer.Deserialize<T>(cachedData, SerializerOptions)
        };
    }

    public async Task SetAsync<T>(string key, T value, TimeSpan? expiration = null, CancellationToken token = default)
    {
        if (value is null) return;

        var bytes = JsonSerializer.SerializeToUtf8Bytes(value, SerializerOptions);

        var options = new DistributedCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = expiration ?? TimeSpan.FromMinutes(10)
        };

        await cache.SetAsync(key, bytes, options, token).ConfigureAwait(false);
    }
}
```

### 3. Synchronization Contract (`IDistributedLockService.cs`)
```csharp
using System;
using System.Threading;
using System.Threading.Tasks;

namespace IMSWebAPI.Services;

public interface IDistributedLockService
{
    Task<string?> TryAcquireLockAsync(string key, TimeSpan ttl, TimeSpan waitTimeout, CancellationToken cancellationToken = default);
    Task<bool> ReleaseLockAsync(string key, string token, CancellationToken cancellationToken = default);
}
```

### 4. Lua-Backed Distributed Synchronization (`RedisDistributedLock.cs`)
```csharp
using System;
using System.Threading;
using System.Threading.Tasks;
using StackExchange.Redis;

namespace IMSWebAPI.Services;

public sealed class RedisDistributedLock(IDatabase redis) : IDistributedLockService
{
    private const string ReleaseScript = @"
        if redis.call('get', KEYS[1]) == ARGV[1] then
            return redis.call('del', KEYS[1])
        else
            return 0
        end";

    public async Task<string?> TryAcquireLockAsync(string key, TimeSpan ttl, TimeSpan waitTimeout, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(key)) throw new ArgumentException("Key must be provided", nameof(key));

        var lockKey = $"lock:{key}";
        var token = Guid.NewGuid().ToString("N");
        var stopAt = DateTime.UtcNow + waitTimeout;
        
        int attempt = 0;
        const int minDelayMs = 10;
        const int maxDelayMs = 200;

        while (DateTime.UtcNow < stopAt && !cancellationToken.IsCancellationRequested)
        {
            var set = await redis.StringSetAsync(lockKey, token, ttl, when: When.NotExists).ConfigureAwait(false);
            if (set) return token;

            // Exponential back-off with jitter to eliminate network/CPU thrashing
            int backoffDelay = (int)Math.Min(maxDelayMs, minDelayMs * Math.Pow(2, attempt++));
            int jitter = Random.Shared.Next(0, 15); 
            var finalDelay = TimeSpan.FromMilliseconds(backoffDelay + jitter);

            await Task.Delay(finalDelay, cancellationToken).ConfigureAwait(false);
        }

        return null;
    }

    public async Task<bool> ReleaseLockAsync(string key, string token, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(key)) throw new ArgumentException("Key must be provided", nameof(key));
        if (string.IsNullOrWhiteSpace(token)) throw new ArgumentException("Token must be provided", nameof(token));

        var lockKey = $"lock:{key}";

        var result = (int)await redis.ScriptEvaluateAsync(
            ReleaseScript, 
            [lockKey], 
            [token]
        ).ConfigureAwait(false);

        return result == 1;
    }
}
```

### 5. Highly Optimized Orchestration Engine (`CacheExtensions.cs`)
```csharp
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace IMSWebAPI.Services;

public static class CacheExtensions
{
    private sealed class RefCountedSemaphore
    {
        public readonly SemaphoreSlim Semaphore = new(1, 1);
        public int RefCount = 1;
    }

    private static readonly ConcurrentDictionary<string, RefCountedSemaphore> KeyLocks = new();

    public static async Task<T?> GetOrSetAsync<T>(
        this ICacheService cache,
        string key,
        Func<Task<T?>> factory,
        TimeSpan? expiration = null,
        IDistributedLockService? distributedLock = null,
        TimeSpan? distributedLockTtl = null,
        TimeSpan? distributedWaitTimeout = null,
        TimeSpan? inProcessWaitTimeout = null,
        CancellationToken token = default)
    {
        if (cache == null) throw new ArgumentNullException(nameof(cache));
        if (factory == null) throw new ArgumentNullException(nameof(factory));
        if (string.IsNullOrWhiteSpace(key)) throw new ArgumentException("Key cannot be null or whitespace.", nameof(key));

        // Step 1: L2 Cache Fast Path Check
        var cached = await cache.GetAsync<T>(key, token).ConfigureAwait(false);
        if (cached is not null) return cached;

        // Step 2: In-Process Filtering (Protects internal container process boundaries)
        var lockWrapper = KeyLocks.AddOrUpdate(
            key, 
            _ => new RefCountedSemaphore(), 
            (_, current) => { Interlocked.Increment(ref current.RefCount); return current; }
        );
        
        var inProcessTimeout = inProcessWaitTimeout ?? TimeSpan.FromSeconds(5);
        var inProcessAcquired = false;

        try
        {
            inProcessAcquired = await lockWrapper.Semaphore.WaitAsync(inProcessTimeout, token).ConfigureAwait(false);
            
            // In-Process Double Check Pattern
            cached = await cache.GetAsync<T>(key, token).ConfigureAwait(false);
            if (cached is not null) return cached;

            // Step 3: Distributed Edge Filtering (Only local process winner talks over TCP)
            if (distributedLock != null)
            {
                var ttl = distributedLockTtl ?? (expiration ?? TimeSpan.FromMinutes(10)) + TimeSpan.FromSeconds(5);
                var wait = distributedWaitTimeout ?? TimeSpan.FromSeconds(5);

                var lockToken = await distributedLock.TryAcquireLockAsync(key, ttl, wait, token).ConfigureAwait(false);
                if (lockToken != null)
                {
                    try
                    {
                        // Global Cluster Double Check Pattern
                        cached = await cache.GetAsync<T>(key, token).ConfigureAwait(false);
                        if (cached is not null) return cached;

                        // Local/Global Winner calls down to primary database
                        var value = await factory().ConfigureAwait(false);
                        if (value is not null)
                        {
                            await cache.SetAsync(key, value, expiration, token).ConfigureAwait(false);
                        }
                        return value;
                    }
                    finally
                    {
                        try { await distributedLock.ReleaseLockAsync(key, lockToken, token).ConfigureAwait(false); } catch { /* swallow */ }
                    }
                }
            }

            // Fallback: If distributed lock was skipped or failed to acquire, execute safely
            return await factory().ConfigureAwait(false);
        }
        finally
        {
            if (inProcessAcquired)
            {
                lockWrapper.Semaphore.Release();
            }

            // Step 4: Reference-Counted Dictionary Housekeeping (Zero Leaks, Zero Race Conditions)
            if (Interlocked.Decrement(ref lockWrapper.RefCount) == 0)
            {
                if (KeyLocks.TryRemove(KeyValuePair.Create(key, lockWrapper)))
                {
                    lockWrapper.Semaphore.Dispose();
                }
            }
        }
    }
}
```

### 6. Composition Root Setup (`Program.cs`)
```csharp
using IMSWebAPI.Services;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

// Connection Multiplexer Thread-Safe Singleton
var redisConnectionString = builder.Configuration.GetSection("RedisOptions:ConnectionString").Value 
    ?? "127.0.0.1:6379,abortConnect=false";
var multiplexer = ConnectionMultiplexer.Connect(redisConnectionString);
builder.Services.AddSingleton<IConnectionMultiplexer>(multiplexer);

// Infrastructure Distributed Cache Engine
builder.Services.AddStackExchangeRedisCache(options =>
{
    options.Configuration = redisConnectionString;
    options.InstanceName = "IMS_";
});

// Singletons to support thread-safe operations across parallel pool
builder.Services.AddSingleton<IDatabase>(provider => provider.GetRequiredService<IConnectionMultiplexer>().GetDatabase());
builder.Services.AddSingleton<IDistributedLockService, RedisDistributedLock>();
builder.Services.AddSingleton<ICacheService, RedisCacheService>();

builder.Services.AddControllers();
var app = builder.Build();
app.MapControllers();
app.Run();
```