/**
 * Next.js middleware helper for Kakunin certificate enforcement.
 *
 * Use inside your project's middleware.ts to protect API routes.
 *
 * @example
 * ```typescript
 * // middleware.ts
 * import { NextRequest } from 'next/server';
 * import { withKakunin } from '@kakunin/middleware/next';
 *
 * export function middleware(req: NextRequest) {
 *   return withKakunin(req, { requiredScope: 'transactions:write' });
 * }
 *
 * export const config = { matcher: ['/api/trade/:path*'] };
 * ```
 */

import {
  verifyCertificate,
  checkScope,
  KakuninVerifyError,
  type KakuninMiddlewareOptions,
  type KakuninVerifyResult,
} from './verify.js';

// Minimal Next.js types (no peer dep on next package)
interface NextRequest {
  headers: { get(name: string): string | null };
  url: string;
}
interface NextResponse {
  headers: Headers;
}

type NextResponseConstructor = {
  next(init?: { request?: { headers?: Headers } }): NextResponse;
  json(body: unknown, init?: { status?: number }): NextResponse;
};

// We accept the NextResponse class/object as a parameter to avoid a hard dep on `next`
export interface WithKakuninOptions extends KakuninMiddlewareOptions {
  NextResponse: NextResponseConstructor;
}

/**
 * Next.js middleware helper. Call inside your middleware.ts.
 * Returns a NextResponse — either a 4xx rejection or a NextResponse.next()
 * with X-Kakunin-* headers attached for downstream route handlers.
 */
export async function withKakunin(
  req: NextRequest,
  options: WithKakuninOptions
): Promise<NextResponse> {
  const { requiredScope, attachResult = true, NextResponse: NR } = options;

  const serial = req.headers.get('x-kakunin-cert-serial');

  if (!serial) {
    return NR.json({ error: 'missing_cert_serial' }, { status: 401 });
  }

  let result: KakuninVerifyResult;
  try {
    result = await verifyCertificate(serial, options);
  } catch (err) {
    if (err instanceof KakuninVerifyError) {
      return NR.json({ error: 'cert_not_found' }, { status: 403 });
    }
    return NR.json({ error: 'verify_unavailable' }, { status: 503 });
  }

  if (!result.valid) {
    const errorCode =
      result.status === 'revoked' ? 'agent_revoked' :
      result.status === 'expired' ? 'agent_expired' :
      'agent_inactive';
    return NR.json({ error: errorCode }, { status: 403 });
  }

  if (requiredScope && !checkScope(result, requiredScope)) {
    return NR.json({ error: 'scope_violation' }, { status: 403 });
  }

  // Pass request through — optionally attach agent metadata as headers
  const requestHeaders = new Headers(req.headers as unknown as Record<string, string>);
  if (attachResult && result.agent) {
    requestHeaders.set('x-kakunin-agent-id', result.agent.id);
    requestHeaders.set('x-kakunin-agent-name', result.agent.name);
    requestHeaders.set('x-kakunin-cert-status', result.status);
  }

  return NR.next({ request: { headers: requestHeaders } });
}
