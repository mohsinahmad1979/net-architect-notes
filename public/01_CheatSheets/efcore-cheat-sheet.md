---
title: EF Core Core Quick Reference
description: Command syntax, pattern blueprints, and architectural validation checklists.
---

# EF Core Enterprise Cheat Sheet

A concise, high-density reference guide for Entity Framework Core in .NET 8 Web API development.

---

## 1. Primary Command Line Interface (CLI) Blueprint

Ensure your terminal execution context points directly to the root path containing your project's `.csproj` configuration file.

| Operation Context | Command Syntax |
| :--- | :--- |
| **Install Global CLI Engine** | `dotnet tool install --global dotnet-ef` |
| **Upgrade Global CLI Engine** | `dotnet tool update --global dotnet-ef` |
| **Synthesize New Migration Delta** | `dotnet ef migrations add <MigrationName>` |
| **Apply Migrations to Target Instance** | `dotnet ef database update` |
| **Rollback Last Migration (Local Only)** | `dotnet ef migrations remove` |
| **Generate Idempotent Production Script** | `dotnet ef migrations script --output update.sql --idempotent` |
| **Compile Binary Migration Bundle** | `dotnet ef migrations bundle --output efbundle.exe` |

---

## 2. Infrastructure Code Snippets

### Enterprise DbContext Pattern
```csharp
using Microsoft.EntityFrameworkCore;
using InventoryManagement.API.Entities;

namespace InventoryManagement.API.Data;

public class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options) {}

    public DbSet<InventoryItem> InventoryItems { get; set; }
    public DbSet<Category> Categories { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        
        // Enforce structural unique index criteria via Fluent API
        modelBuilder.Entity<InventoryItem>().HasIndex(i => i.Sku).IsUnique();
    }
}
```

### Service Engine Registration (`Program.cs`)
```csharp
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));
```

### Standard Connection String Blueprint (`appsettings.json`)
```json
"ConnectionStrings": {
  "DefaultConnection": "Server=(localdb)\mssqllocaldb;Database=AmazonInventoryDb;Trusted_Connection=True;MultipleActiveResultSets=true;TrustServerCertificate=True"
}
```

---

## 3. High-Performance Query Blueprints

### Highly Concurrent Async Read-Only Lookup
```csharp
var items = await _context.InventoryItems
    .AsNoTracking()                       // Bypasses internal tracking engines
    .Include(item => item.Category)       // Eager loads related properties via SQL JOIN
    .Where(item => item.QuantityOnHand > 0) // Explicitly parameterized query expression
    .ToListAsync();
```

### Secure Single Record Search
```csharp
var item = await _context.InventoryItems
    .AsNoTracking()
    .FirstOrDefaultAsync(i => i.Id == targetGuidId); // Preferred over FindAsync for Read-Only operations
```

### High-Concurrency Resilience Write Wrapper
```csharp
await _context.InventoryItems.AddAsync(item);
try 
{
    await _context.SaveChangesAsync();
}
catch (DbUpdateException ex) when (ex.InnerException is SqlException sqlEx && (sqlEx.Number == 2601 || sqlEx.Number == 2627))
{
    // Gracefully handle database-level unique constraint violations
    return Conflict("Unique data collision identified.");
}
```

---

## 4. Query Architectural Selection Matrix

| Operation Objective | Use Tracking? | Recommended Execution Pattern |
| :--- | :--- | :--- |
| **Display Data to Client UI** | ❌ No (`.AsNoTracking()`) | `.AsNoTracking().Where(...).ToListAsync()` |
| **Calculate Aggregates/Reports** | ❌ No (`.AsNoTracking()`) | `.AsNoTracking().Select(...).SumAsync()` |
| **Locate Item for Read-Only API** | ❌ No (`.AsNoTracking()`) | `.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id)` |
| **Locate Item to Modify/Delete** |  Yes (Tracking Enabled) | `FindAsync(id)` or `FirstOrDefaultAsync(x => x.Id == id)` |
| **Create/Insert New Record** |  Yes (Tracking Enabled) | `AddAsync(entity)` followed by `SaveChangesAsync()` |

---

## 5. Architectural Quality Checklist

* [ ] **Cryptographic Keys**: Use `Guid` instead of auto-incrementing `int` identifiers on all enterprise models to protect against ID enumeration scanning.
* [ ] **Data Stream Precision**: Ensure all currency or monetary fields are flagged explicitly with `[Column(TypeName = "decimal(18,2)")]` to avoid rounding/truncation bugs.
* [ ] **No-Tracking Rule**: Apply `.AsNoTracking()` to 100% of incoming read-only (`GET`) transaction streams.
* [ ] **Zero Startup Migrations**: Ensure `context.Database.Migrate()` is removed from production app startup code paths to prevent scale-out deadlocks.
* [ ] **Parameterized Conditions**: Keep all filters inside strongly typed LINQ `.Where()` lambdas to guarantee protection against SQL Injection attacks.
* [ ] **Safe Schema Expansion**: Never delete or rename production columns outright. Always execute destructive changes using the multi-stage **Expand and Contract Pattern**.