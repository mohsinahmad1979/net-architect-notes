```markdown
---
title: Session Checkpoint & Context Restore
description: Context restoration blueprint for continuing the EF Core and .NET 8 Web API development session.
---

# EF Core & .NET 8 Web API: Session Checkpoint & Context Restore

**Instructions for Context Ingestion:** Act as an expert .NET backend architect and senior engineer. Review the following architectural blueprint, code patterns, and systemic decisions established during the previous session to perfectly align your mental model with the current state of the project.

---

## 1. Project Context & Tech Stack
* **Runtime**: .NET 8 (Web API Architecture)
* **Data Access Layer**: Entity Framework Core (Code-First Paradigm)
* **Database Provider**: SQL Server (LocalDB for development, Azure SQL for production target)
* **Domain Context**: Enterprise Inventory Management System (IMS)

---

## 2. Structural State: Domain Entities

### `Category` (Parent Entity)
* Has a 1:N relationship with `InventoryItem`.
* Contains `Id` (`Guid`), `Name` (`string`, max length 100).
* Navigation collection: `ICollection<InventoryItem>`.

### `InventoryItem` (Dependent Entity)
* **Key Strategy**: Cryptographic `Guid` identifiers to prevent resource enumeration vectors.
* **Core Layout**: `Sku` (Unique Index, Max 50), `Name` (Max 100), `Description` (Max 500), `QuantityOnHand` (`int`), `Price` (`decimal`).
* **Database Type Explicit Configuration**: Money fields strictly flagged with `[Column(TypeName = "decimal(18,2)")]` to avoid runtime scale rounding bugs.
* **Relationship**: Strict, non-nullable Foreign Key constraint (`Guid CategoryId`) with an explicit navigation property (`Category? Category`).
* **Audit Footprint**: `CreatedAtUtc` and `UpdatedAtUtc`.

---

## 3. Core Architectural Decisions

* **Asynchronous Web Pipeline**: All I/O operations strictly leverage `async` / `await` paradigms (`ToListAsync`, `FirstOrDefaultAsync`, `SaveChangesAsync`) to maximize thread pool efficiency under high concurrent loads.
* **Strict Database Integrity**: Rejected optional/nullable constraints for the `CategoryId` relationship. The local database was safely dropped and reconstructed (`InitialWithCategories`) to allow strict, non-nullable table structures to align cleanly from the first row.
* **Change-Tracking Separation**: 
  * **Read Paths (GET)**: Bypasses EF Core tracking infrastructure using `.AsNoTracking()` to reduce heap allocation and overhead. `FindAsync` is avoided on read-only endpoints in favor of `.AsNoTracking().FirstOrDefaultAsync()` to isolate state.
  * **Write Paths (POST/PUT/DELETE)**: Leverage tracking state adjustments (`_context.AddAsync`, `_context.Remove`). Transactions are flushed atomically via the Unit of Work engine using `await _context.SaveChangesAsync()`.
* **Zero-Downtime Azure Deployment Rules**:
  * **Anti-Pattern Prohibited**: `Database.Migrate()` inside application startup blocks is strictly banned to prevent race-condition deadlocks during multi-instance auto-scaling events on Azure.
  * **Production Tooling Choice**: Isolated CI/CD delivery using either **Idempotent SQL Scripts** (`--idempotent`) executed via automated runner tasks or compiled binary execution engines via **Migration Bundles** (`dotnet ef migrations bundle`).
  * **The Expand & Contract Pattern**: Schema updates (such as field renames or structural modifications) must be broken down into multi-stage, backwards-compatible deployments to ensure zero downtime.

---

## 4. Established Code Patterns

### Robust Unique Constraint Exception Handling
Validating state via logical queries (`AnyAsync`) is prone to multi-threaded race conditions. The data persistence block encapsulates structural database-driver safety checks:

```csharp
try
{
    await _context.SaveChangesAsync();
}
catch (DbUpdateException ex)
{
    // Evaluates the database driver's inner codes (SQL Server 2601 / 2627 for Unique Index violations)
    if (ex.InnerException is Microsoft.Data.SqlClient.SqlException sqlEx && 
        (sqlEx.Number == 2601 || sqlEx.Number == 2627))
    {
        return Conflict(new { Message = "Concurrency conflict: Unique index violation detected." });
    }
    throw;
}


### Eager Loading with Parameterized Filtering
Prevents the $N+1$ query overhead by synthesizing optimized `LEFT JOIN` structures on the database server while maintaining safety from SQL Injection via parameterized LINQ:

```csharp
var items = await _context.InventoryItems
    .AsNoTracking()
    .Include(item => item.Category)
    .Where(item => item.QuantityOnHand <= threshold)
    .ToListAsync();

---

## 5. Completed Milestones
1. Implemented complete Asynchronous CRUD Controller endpoints matching REST specifications (`201 CreatedAtAction`, `204 NoContent`, `404 NotFound`).
2. Resolved relational schema data-conflicts via localized database refactoring.
3. Successfully compiled and exported comprehensive documentation suites (`efcore-deep-dive.md` and `efcore-cheat-sheet.md`) bundled cleanly for a static VitePress generation project.

---

## 6. Immediate Next Steps for Next Session

1. **Implement the Data Transfer Object (DTO) Pattern**: Introduce separate models for Request/Response handling to isolate database structures from API consumers and prevent mass-assignment vulnerabilities.
2. **Global Exception Handling Middleware**: Refactor inline try-catch blocks out of business controllers into a central .NET Exception Handler middleware pipeline.
3. **Advanced Performance Benchmarking**: Introduce pagination (`Skip` / `Take`) and evaluate global query filters for implementing soft-deletion models (`IsDeleted`).

**Ready to resume.** Please prompt the user for instructions on how they want to tackle the next phase.