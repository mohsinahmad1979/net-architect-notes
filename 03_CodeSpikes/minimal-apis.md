# Code Spike: Minimal APIs vs Heavy Controllers in .NET 9

Modern .NET avoids the overhead of MVC Controller reflection by using the routing engine to directly map endpoints to delegates. 

```csharp
var builder = WebApplication.CreateBuilder(args);

// Industrial Practice: Registering dependency with explicit lifetime management
builder.Services.AddScoped<IOrderRepository, SqlOrderRepository>();

var app = builder.Build();

// Modern .NET 9 Idiom: MapGroup for API versioning and cleaner routing trees
var v1Orders = app.MapGroup("/api/v1/orders")
                  .WithOpenApi(); // Built-in OpenAPI documentation support

v1Orders.MapPost("/", async (OrderDto dto, IOrderRepository repo) => 
{
    if (dto is null) return Results.BadRequest();
    
    var order = new Order { Id = Guid.NewGuid(), Amount = dto.Amount };
    await repo.SaveAsync(order);
    
    return Results.Created($"/api/v1/orders/{order.Id}", order);
});

app.Run();