# Technical Sprint Summary: Distributed & In-Process Cache Orchestration

## 1. Context & Architectural Persona
* **Role:** Principal .NET Systems Architect.
* **Target Environment:** .NET 8/9 Cloud-Native Web API (`IMSWebAPI`).
* **Developer Profile:** 20 years of foundational backend engineering experience (highly fluent in OOP, data normalization, database engines, and structural patterns), transitioning into modern .NET high-concurrency cloud architecture.

---

## 2. Progress & Scope Completed
* **Local Engine Setup:** Verified and resolved localized `RedisConnectionException` timeouts by configuring and deploying a local Docker-based Redis engine container (`127.0.0.1:6379`) alongside **Redis Insight** for visualization.
* **Refactoring Strategy:** Transitioned an initial controller-level cache implementation into a completely decentralized, generic, thread-safe framework layer. Refactored a baseline AI (Copilot) implementation to fix race conditions, thread safety bugs, and network polling overhead.

---

## 3. Core Architectural Decisions

### Cache-Aside Pattern
Implemented via a custom, strongly typed wrapper abstraction (`ICacheService` / `RedisCacheService`) wrapping the native `IDistributedCache` infrastructure.

### Two-Layer Optimized Stampede Protection (Thundering Herd)
To prevent downstream database saturation under severe parallel traffic, incoming threads are filtered sequentially:
1. **In-Process First:** Local requests filter through an optimized in-process lock layer using `SemaphoreSlim` to shield individual container resources.
2. **Distributed Second:** The local winning thread then attempts to acquire a global cluster-wide distributed lock using an atomic Redis `SET NX PX` mechanism before querying persistence.

### High-Performance Memory & CPU Optimization
* Bypassed traditional string-based JSON serialization allocations (which heavily thrash the Managed Heap/LOH) by serializing entities directly to raw `byte[]` segments via `JsonSerializer.SerializeToUtf8Bytes`.
* Replaced a standard loop-based fixed `Task.Delay` polling spin-lock inside the custom distributed lock engine with an **exponential back-off with random jitter** to eliminate TCP socket and Redis CPU thrashed spikes.

---

## 4. Code Patterns Established
The solution heavily leverages modern C# syntax expansions including **file-scoped namespaces**, **pattern matching** expressions, and **primary constructors**.

### Reference-Counted Cleanup Pattern
To resolve a classic `ObjectDisposedException` race condition, a custom `RefCountedSemaphore` wrapper was bound to a global `ConcurrentDictionary<string, RefCountedSemaphore>`. It leverages `Interlocked.Increment` and `Interlocked.Decrement` primitives to safely track and prune idle locks out of memory without colliding with concurrent request allocations.

---

## 5. Current Codebase State Reference

* **`ICacheService` & `RedisCacheService`:** Pure async serialization layer handling UTF-8 byte arrays cleanly.
* **`IDistributedLockService` & `RedisDistributedLock`:** Lightweight Lua script-backed cluster locking mechanism incorporating exponential back-off.
* **`CacheExtensions.GetOrSetAsync<T>`:** The centralized, generic orchestrator managing the multi-tiered locking fabric and double-check evaluation patterns.
* **`Program.cs`:** Singleton configuration topology injecting `IConnectionMultiplexer`, `IDatabase`, `IDistributedLockService`, and `ICacheService`.

---

## 6. Immediate Next Steps for Follow-up Chats
1. **Resiliency Integration:** Implement fallback/degradation behavior (e.g., Polly-backed Circuit Breaker or Retry policies) to allow the API to safely fall back to read-through database mechanics if the Redis cluster drops offline.
2. **Cache Invalidation Framework:** Design a centralized write-path infrastructure (e.g., leveraging Domain Events or MediatR pipelines) to evict or update keys upon mutation (`PUT`/`DELETE`).
3. **Upgrade Path Assessment:** Evaluate migrating the custom `CacheExtensions` locking engine entirely to **.NET 9’s native `HybridCache`** framework feature.