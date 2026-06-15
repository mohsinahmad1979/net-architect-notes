# Part 2: Lead Architect Interview Cheat Sheet

| Topic | Strategic Concept | "Lead" Pro-Tip | Azure Service Stack |
| :--- | :--- | :--- | :--- |
| **Scaling** | **Y-Axis Scaling** | Scale functional units, not just the whole app. | **Azure Container Apps** |
| **Boundaries** | **Bounded Contexts** | Use DDD to prevent "God Objects" from bloating services. | **Azure API Management** |
| **Consistency** | **BASE over ACID** | Explain that eventual consistency is a business trade-off for availability. | **Azure Cosmos DB** |
| **Resiliency** | **Circuit Breaker** | Mention **Polly** for .NET or **Dapr** for infrastructure-level resilience. | **Azure App Gateway** |
| **Latency** | **Tail-at-Scale** | Mitigation via hedged requests and strict timeouts to protect p99 latency. | **Azure Front Door** |
| **Legacy** | **Strangler Fig** | Use an **Anti-Corruption Layer (ACL)** to stop legacy models from polluting new code. | **YARP / APIM** |
| **Messaging** | **Event-Carried State** | Include all data in the event to remove the need for consumers to call back. | **Azure Service Bus** |
| **Security** | **Zero Trust** | Use **Managed Identities** to eliminate secrets from your source code. | **Entra ID / Key Vault** |
| **DevOps** | **GitOps / IaC** | Infrastructure must be repeatable across regions via **Bicep**. | **GitHub Actions** |

### Critical Architect Interview Questions to Expect:
1.  **"How do you define service boundaries?"** Answer: Start with business capabilities and refine using DDD subdomains to ensure autonomy.
2.  **"Why use Container Apps instead of AKS?"** Answer: For your team (K8s experience 0), ACA provides the scaling benefits without the "management tax" of K8s clusters.
3.  **"How do you handle global consistency?"** Answer: Use the **Saga pattern** for cross-service workflows and **Azure Cosmos DB** with multi-region write/read for the data tier.