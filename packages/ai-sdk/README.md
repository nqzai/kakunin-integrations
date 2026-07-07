# @kakunin/ai-sdk

[Kakunin](https://kakunin.ai) compliance tools for the [Vercel AI SDK](https://sdk.vercel.ai) — verify agent certificates, check scopes, read risk scores, and emit EU AI Act audit events as AI SDK tools.

```bash
npm install @kakunin/ai-sdk ai
```

```ts
import { generateText } from 'ai';
import { createKakuninTools } from '@kakunin/ai-sdk';

const tools = createKakuninTools({ apiKey: process.env.KAKUNIN_API_KEY! });

const { text } = await generateText({
  model,
  tools,
  prompt: 'Verify agent agt-123 before delegating the trade.',
});
```

`createKakuninTools()` returns AI SDK tools for certificate verification, scope checks, risk scoring, and behavioral-event emission. Licensed under Apache-2.0.
