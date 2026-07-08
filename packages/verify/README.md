# @kakunin/verify

Certificate-enforcement middleware for services that receive traffic from
Kakunin-certified AI agents. This package is a thin re-export of
[`@kakunin/sdk/verify`](https://github.com/nqzai/kakunin-sdk-typescript) —
published standalone so `npm install @kakunin/verify` works on its own.

```bash
npm install @kakunin/verify
```

```ts
// Next.js / Fetch, Express, Fastify, Cloudflare Workers, Hono, Remix
import { kakuninMiddleware } from '@kakunin/verify';

const enforce = kakuninMiddleware();
export async function middleware(req: Request) {
  const { agent, reject } = await enforce(req);
  if (!agent) return reject('Missing or invalid agent certificate');
}
```

Installing `@kakunin/verify` pulls in `@kakunin/sdk`; the two expose the same
middleware, so use whichever import you prefer. Full docs at
[kakunin.ai/docs](https://www.kakunin.ai/docs).

Apache-2.0.
