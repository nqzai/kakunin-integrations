# @kakunin/middleware

Express, Fastify, and Next.js middleware for [Kakunin](https://kakunin.ai) AI agent certificate enforcement.

Reads the `X-Kakunin-Cert-Serial` header, verifies the agent's certificate via the public Kakunin API, and rejects revoked, expired, or out-of-scope agents with a `403` before your route handler runs.

```
npm install @kakunin/middleware
```

## Express

```typescript
import express from 'express';
import { kakuninGateway } from '@kakunin/middleware/express';

const app = express();

// Protect all routes — only certified agents pass
app.use(kakuninGateway({
  requiredScope: 'transactions:write', // optional — enforce cert scope
  cacheMs: 5000,                       // cache verify responses 5s (default)
}));

app.post('/trade', (req, res) => {
  // req.kakunin is available — agent identity, scope, expiry
  const { agent } = req.kakunin!;
  res.json({ executed: true, by: agent?.name });
});
```

## Fastify

```typescript
import Fastify from 'fastify';
import { kakuninPlugin } from '@kakunin/middleware/fastify';

const app = Fastify();
await app.register(kakuninPlugin, { requiredScope: 'transactions:write' });

app.post('/trade', async (req) => {
  return { executed: true, by: req.kakunin?.agent?.name };
});
```

## Next.js

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { withKakunin } from '@kakunin/middleware/next';

export function middleware(req: NextRequest) {
  return withKakunin(req, {
    NextResponse,
    requiredScope: 'transactions:write',
  });
}

export const config = { matcher: ['/api/trade/:path*'] };
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `requiredScope` | `string` | — | Required `permitted_action` value in the agent's cert scope |
| `cacheMs` | `number` | `5000` | In-process cache TTL in ms. `0` = disabled |
| `verifyBaseUrl` | `string` | `https://kakunin.ai/api/v1/verify` | Override for testing |
| `attachResult` | `boolean` | `true` | Attach verify result to `req.kakunin` / request headers |

## Error responses

| Condition | Status | `error` field |
|---|---|---|
| No `X-Kakunin-Cert-Serial` header | 401 | `missing_cert_serial` |
| Certificate serial not found | 403 | `cert_not_found` |
| Certificate revoked | 403 | `agent_revoked` |
| Certificate expired | 403 | `agent_expired` |
| Agent inactive/suspended | 403 | `agent_inactive` |
| Scope check failed | 403 | `scope_violation` |
| Verify API unreachable | 503 | `verify_unavailable` |

## How it works

1. Reads `X-Kakunin-Cert-Serial` from the inbound request header
2. Calls `GET https://kakunin.ai/api/v1/verify/{serial}` (public endpoint, no API key)
3. Caches the response in-process for `cacheMs` milliseconds (cache hits are sub-1ms)
4. Returns 403 if `valid: false` or scope check fails
5. Passes the request through on success

The verify endpoint is globally distributed and returns in under 500ms p99. With the default 5s cache, repeated requests from the same agent cost ~0ms after the first hit.

## Docs

- [Enforcement docs](https://kakunin.ai/docs/enforcement)
- [Message signing](https://kakunin.ai/docs/message-signing)
- [Certificate verification](https://kakunin.ai/docs/verify)
