# High-Yield Interview Cheat Sheet: .NET & Redis Caching Architecture

Use this guide for rapid review before system design and advanced .NET engineering interviews.

---

## 1. Core Pattern: Cache-Aside (Lazy Loading)
* **What it is:** The application orchestrates reading from the cache. On a miss, it reads from the database, writes back to the cache, and returns the data.
* **Why use it:** Isolates reading/writing logic, ensures the cache only contains frequently requested data, and keeps the system operational even if the caching tier experiences transient downtime.
* **The Performance Win:** Avoid string serialization (`JsonSerializer.Serialize`). Serialize objects directly to raw bytes via `JsonSerializer.SerializeToUtf8Bytes` to dramatically reduce Garbage Collection (GC) thrashing and keep allocations off the Large Object Heap (LOH).

---

## 2. The Nightmare Scenario: Cache Stampede (Thundering Herd)
* **The Problem:** A high-frequency key expires. 1,000 requests hit the endpoint at the exact same millisecond, see a cache miss, and simultaneously storm the primary database, crashing the persistent layer.
* **The Enterprise Solution:** **Multi-Layered Token Protection (In-Process + Distributed Lock)** with a **Double-Check Lock Pattern**.

---

## 3. Layer 1: In-Process Synchronization (`SemaphoreSlim`)
* **Concept:** Restricts multi-threaded concurrency *inside a single application instance (pod/container)*.
* **The Interview Trap (The Dictionary Lifecycle Bug):** Dynamically allocating and calling `.Dispose()` on a `SemaphoreSlim` inside a standard `ConcurrentDictionary` creates a race condition. If Thread A deletes and disposes of a semaphore while Thread B is concurrently trying to acquire it, the app crashes with an `ObjectDisposedException`.
* **The Architectural Fix:** Use a **Reference-Counted Wrapper** with atomic `Interlocked.Increment` / `Decrement` primitives to safely prune idle semaphores out of memory.

```csharp
// The Ref-Counted Fix
private sealed class RefCountedSemaphore {
    public readonly SemaphoreSlim Semaphore = new(1, 1);
    public int RefCount = 1;
}
```

---

## 4. Layer 2: Distributed Synchronization (Redis Locks)
* **Concept:** Extends locking across *multiple server instances/replicas* in a cloud cluster.
* **Mechanism:** 1. **Acquire:** Use an atomic `StringSetAsync(key, token, ttl, When.NotExists)` (`SET NX PX`).
  2. **Release:** Use an atomic **Lua Script** to verify that the calling thread owns the specific token before deleting the lock key. This prevents a slow thread from accidentally deleting a lock held by a newer thread.
* **The Interview Trap (Spin-Locks):** Polling Redis on a fixed loop (`Task.Delay(100)`) spikes CPU and wastes network bandwidth.
* **The Architectural Fix:** Implement an **Exponential Back-off with Random Jitter** to break up concurrent retry waves.

```csharp
// Atomic Release Lua Script
private const string ReleaseScript = @"
    if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('del', KEYS[1])
    else
        return 0
    end";
```

---

## 5. Architectural Blueprint: Optimal Lock Sequencing
Always chain locks from the lowest latency boundary (local memory) to the highest latency boundary (external network).

```
[Incoming Traffic Wave]
          │
          ▼
1. Fast-Path Cache Check ──(Hit)──> Return Immediately
          │ (Miss)
          ▼
2. In-Process Lock (`SemaphoreSlim`) 
          │ (Compresses 1,000 local threads down to 1 local winner)
          ▼
3. Local Cache Double-Check ──(Hit)──> Release Local Lock & Return
          │ (Still a Miss)
          ▼
4. Distributed Lock (Redis `SET NX`)
          │ (Compresses multiple cluster instances down to 1 global winner)
          ▼
5. Global Cache Double-Check ──(Hit)──> Release All Locks & Return
          │ (Confirmed Global Miss)
          ▼
6. Query Downstream Database ──> Write Cache ──> Release All Locks
```

---

## 6. Top 3 Keywords to Drop in the Interview

1. **"Double-Check Lock Pattern"**: *"I always re-verify the cache layer immediately after acquiring my synchronization lock. This ensures that if another concurrent thread populated the cache while I was waiting in the queue, I read the newly cached value rather than triggering a duplicate, redundant database query."*
2. **"Interlocked Operations"**: *"To manage the lifecycle of my lock dictionary safely across threads without introducing heavy `lock` blocks, I use atomic CPU-level `Interlocked.Increment` and `Interlocked.Decrement` operations to handle object reference counts."*
3. **"In-Process Filtering First"**: *"Instead of forcing all container instances to flood the shared Redis node looking for a distributed lock, I apply local in-process synchronization first. This drastically lowers network overhead and protects our distributed infrastructure node from CPU saturation."*