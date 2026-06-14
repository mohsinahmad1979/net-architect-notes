# Deep Dive: Transitioning Legacy WCF to gRPC

### The Technical "Why"
Legacy WCF relies on heavy SOAP XML serialization and basic HTTP or TCP transport, which hurts performance. Modern .NET uses **gRPC**, a contract-first framework built over **HTTP/2** and binary **Protocol Buffers (Protobuf)**, yielding up to 10x faster serialization and multiplexing over a single connection.

### Architectural Mapping

| Metric / Feature | Legacy WCF | Modern gRPC |
| :--- | :--- | :--- |
| **Contract Format** | C# Interface (`[ServiceContract]`) | `.proto` File IDL |
| **Wire Format** | Text-based XML | Binary Protocol Buffers |
| **Transport** | HTTP 1.1 / Net.TCP | HTTP/2 (Bi-directional Streaming) |

### Migration Pitfalls
* **No Native Browser Support:** gRPC requires HTTP/2 end-to-end. For browser clients, we must introduce `grpc-web` acting as a proxy layer, or map it using .NET 9 JSON Transcoding.