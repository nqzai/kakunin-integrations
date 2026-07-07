# @kakunin/mastra

[Kakunin](https://kakunin.ai) compliance integration for [Mastra](https://mastra.ai) — give any Mastra agent tools to verify agent certificates, check scopes, read risk scores, and emit EU AI Act audit events.

```bash
npm install @kakunin/mastra @mastra/core
```

```ts
import { Agent } from '@mastra/core/agent';
import { KakuninIntegration } from '@kakunin/mastra';

const kakunin = new KakuninIntegration({ apiKey: process.env.KAKUNIN_API_KEY! });

const agent = new Agent({
  name: 'compliance-aware-agent',
  instructions: 'Verify agent identity before trusting it.',
  model,
  tools: kakunin.getTools(),
});
```

`getTools()` returns Mastra tools for certificate verification, scope checks, risk scoring, and behavioral-event emission. Licensed under Apache-2.0.
