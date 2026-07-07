/**
 * Express middleware for Kakunin certificate enforcement.
 *
 * Reads X-Kakunin-Cert-Serial header, verifies via public API,
 * rejects revoked/expired/out-of-scope agents with 403.
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { kakuninGateway } from '@kakunin/middleware/express';
 *
 * const app = express();
 * app.use(kakuninGateway({ requiredScope: 'transactions:write', cacheMs: 5000 }));
 * ```
 */

import {
  verifyCertificate,
  checkScope,
  KakuninVerifyError,
  type KakuninMiddlewareOptions,
  type KakuninVerifyResult,
} from './verify.js';

type ExpressRequest = {
  headers: Record<string, string | string[] | undefined>;
  kakunin?: KakuninVerifyResult;
};
type ExpressResponse = {
  status(code: number): ExpressResponse;
  json(body: unknown): void;
};
type ExpressNext = (err?: unknown) => void;
type ExpressMiddleware = (req: ExpressRequest, res: ExpressResponse, next: ExpressNext) => void;

/**
 * Returns an Express middleware that enforces Kakunin certificate validity.
 * Attach before any routes that should only be accessible to certified agents.
 */
export function kakuninGateway(options: KakuninMiddlewareOptions = {}): ExpressMiddleware {
  const { requiredScope, attachResult = true } = options;

  return async function kakuninMiddleware(req, res, next) {
    const headerVal = req.headers['x-kakunin-cert-serial'];
    const serial = Array.isArray(headerVal) ? headerVal[0] : headerVal;

    if (!serial) {
      return res.status(401).json({ error: 'missing_cert_serial' });
    }

    let result: KakuninVerifyResult;
    try {
      result = await verifyCertificate(serial, options);
    } catch (err) {
      if (err instanceof KakuninVerifyError) {
        return res.status(403).json({ error: 'cert_not_found' });
      }
      // Network / timeout — fail open with warning, or fail closed based on preference
      return res.status(503).json({ error: 'verify_unavailable' });
    }

    if (!result.valid) {
      const errorCode =
        result.status === 'revoked' ? 'agent_revoked' :
        result.status === 'expired' ? 'agent_expired' :
        'agent_inactive';
      return res.status(403).json({ error: errorCode });
    }

    if (requiredScope && !checkScope(result, requiredScope)) {
      return res.status(403).json({ error: 'scope_violation' });
    }

    if (attachResult) {
      req.kakunin = result;
    }

    next();
  };
}
