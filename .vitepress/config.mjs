export default {
  title: "Architect Brain",
  description: "20-Year Legacy to Modern .NET Cloud Architect",
  themeConfig: {
    sidebar: [
      {
        text: '01. Cheat Sheets (2-Hour Notice)',
        items: [
          { text: 'Microservices Patterns', link: '/01_CheatSheets/microservices' },
          { text: '.NET 9 Runtime & JIT', link: '/01_CheatSheets/net9-runtime' }
        ]
      },
      {
        text: '02. Deep-Dive Topics',
        items: [
          { text: 'WCF to gRPC Migration', link: '/02_Topics/grpc-migration' },
          { text: 'EF Core 9 Performance', link: '/02_Topics/efcore-perf' }
        ]
      },
      {
        text: '03. Code Spikes',
        items: [
          { text: 'Modern Minimal APIs', link: '/03_CodeSpikes/minimal-apis' },
          { text: 'High-Throughput Async Streams', link: '/03_CodeSpikes/async-streams' }
        ]
      },
      {
        text: '04. AI Prompts & Context',
        items: [
          { text: 'Session Ignition Template', link: '/04_AI_Prompts/hydration-template' }
        ]
      }
    ]
  }
}