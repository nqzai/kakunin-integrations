# Kakunin Integrations — AI agent identity & compliance for LangChain, Mastra, Vercel AI SDK & Express

[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/nqzai/kakunin-integrations/badge)](https://scorecard.dev/viewer/?uri=github.com/nqzai/kakunin-integrations)

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

## Contributors

<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
<!-- ALL-CONTRIBUTORS-BADGE:END -->

Thanks to everyone who contributes ([emoji key](https://allcontributors.org/docs/en/emoji-key)) — code and non-code alike:

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

Contributions of any kind are welcome — this project follows the [all-contributors](https://allcontributors.org) spec.
