# Cheat Sheet: Microservices Architectural Patterns

### The Elevator Pitch for Architects
"When moving away from legacies, I avoid distributed monoliths by enforcing strict service boundaries via domain-driven design (DDD). Data belongs to the service; communication is asynchronous by default."

### Core Architectural Patterns
* **Saga Pattern (Orchestration vs. Choreography):** Used for distributed transactions. I prefer *Choreography* (event-driven via message brokers) for loose coupling, and *Orchestration* (centralized coordinator) for highly complex workflows.
* **CQRS (Command Query Responsibility Segregation):** Separates read models (optimized for UI via read-replicas or NoSQL) from write models (highly normalized transaction engines).
* **API Gateway:** Single entry point handling cross-cutting concerns (authentication, rate limiting, SSL termination, request routing).

### Top 3 Interview Trade-offs
1.  **Eventual Consistency vs. ACID:** We trade instant transactional consistency for horizontal availability ($BASE$ vs $ACID$).
2.  **Network Latency:** Every remote network call can fail. I mitigation this with Retries, Exponential Backoff, and Circuit Breakers (using **Polly** in .NET).