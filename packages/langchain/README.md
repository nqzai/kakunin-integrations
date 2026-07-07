# @kakunin/langchain

[Kakunin](https://kakunin.ai) compliance tools for [LangChain JS](https://js.langchain.com) — verify agent certificates and enforce scopes inside tools and chains.

```bash
npm install @kakunin/langchain @langchain/core @kakunin/sdk
```

```ts
import { Kakunin } from '@kakunin/sdk';
import { KakuninToolGuard } from '@kakunin/langchain';

const kakunin = new Kakunin({ apiKey: process.env.KAKUNIN_API_KEY! });

// Wrap any LangChain tool — scope is verified before every call
const guarded = new KakuninToolGuard({
  kakunin,
  agentId: 'agt-123',
  tool: myTool,
  requiredScopes: ['trade.execute'],
});
```

Also exports `langchainScopeCallback` (chain-level guard), `KakuninScopeCallbackHandler`, and `ScopeViolationError`. Licensed under Apache-2.0.
