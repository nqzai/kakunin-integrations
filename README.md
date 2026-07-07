# Kakunin Integrations

Framework integrations for the [Kakunin](https://kakunin.ai) AI agent compliance platform — verify agent certificates, enforce scopes, and emit behavioral events from inside popular agent and web frameworks.

Each package publishes independently to npm under the `@kakunin` scope.

| Package | Framework | Install |
|---|---|---|
| [`@kakunin/middleware`](packages/middleware) | Express / Fastify / Next.js | `npm i @kakunin/middleware` |
| [`@kakunin/langchain`](packages/langchain) | LangChain JS | `npm i @kakunin/langchain` |
| [`@kakunin/mastra`](packages/mastra) | Mastra | `npm i @kakunin/mastra` |
| [`@kakunin/ai-sdk`](packages/ai-sdk) | Vercel AI SDK | `npm i @kakunin/ai-sdk` |

For the core SDK and certificate-enforcement middleware, see [`@kakunin/sdk`](https://github.com/nqzai/kakunin-sdk-typescript).

## Development

```bash
npm install          # installs all workspaces
npm run build        # build every package
npm run typecheck
npm test
```

Licensed under Apache-2.0.
