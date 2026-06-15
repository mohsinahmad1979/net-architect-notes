# ASP.NET Core Senior Interview Cheat Sheet 🧠

| Concept | The "Expert" Answer | Source |
| :--- | :--- | :--- |
| **Why is `async void` bad?** | It is "fire-and-forget." The caller cannot track completion or catch exceptions, which **crashes the process** if they occur. | |
| **What is Thread Pool Starvation?** | Occurs when worker threads are blocked by `.Result` or `.Wait()`. The pool "hill-climbs" to create new threads slowly, causing latency to skyrocket. | |
| **Task vs ValueTask?** | `Task` is a **reference type** (heap); `ValueTask` is a **struct** (stack). Use `ValueTask` on high-frequency "hot paths" to reduce GC pressure. | |
| **`WhenAll` Exception Behavior?** | `Task.WhenAll` aggregates all exceptions in its `.Exception` property, but `await` only throws the **first** one chronologically. | |
| **`ConfigureAwait(false)` in Core?** | In ASP.NET Core, it's technically a no-op because there's no `SynchronizationContext`. However, **Library/NuGet** authors must still use it for compatibility with UI apps. | |
| **`GetResult()` vs `.Result`?** | Both are "Sync-over-Async". `.Result` wraps exceptions in `AggregateException`, whereas `GetAwaiter().GetResult()` throws the **original exception** directly. | |
| **What is "Lowering"?** | The compiler transformation of `async` methods into an internal **State Machine struct** to manage continuations without manual callbacks. | |

### The "Senior" Code Review Checklist:
1.  **Async All the Way:** Verify no `.Wait()` or `.Result` calls in the stack.
2.  **Cancellation:** Ensure `CancellationToken` is flowed to every I/O-bound call.
3.  **Allocations:** On hot paths, check if `ValueTask` or `ArrayPool` is appropriate.
4.  **Streaming:** Use `IAsyncEnumerable` for large lists to prevent Out-of-Memory (OOM) errors.
5.  **Flushing:** Call `FlushAsync` before disposing `StreamWriter` to avoid synchronous blocking during `Dispose`.