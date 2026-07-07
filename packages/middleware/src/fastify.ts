/**
 * Fastify plugin for Kakunin certificate enforcement.
 *
 * @example
 * ```typescript
 * import Fastify from 'fastify';
 * import { kakuninPlugin } from '@kakunin/middleware/fastify';
 *
 * const app = Fastify();
 * await app.register(kakuninPlugin, { requiredScope: 'transactions:write' });
 * ```
 */

import {
  verifyCertificate,
  checkScope,
  KakuninVerifyError,
  type KakuninMiddlewareOptions,
  type KakuninVerifyResult,
} from './verify.js';

// Minimal Fastify types (no peer dep on fastify package)
type FastifyInstance = {
  decorateRequest(name: string, value: unknown): void;
  addHook(name: 'preHandler', fn: (req: FastifyRequest, reply: FastifyReply, done: () => void) => Promise<void>): void;
};
type FastifyRequest = {
  headers: Record<string, string | string[] | undefined>;
  kakunin?: KakuninVerifyResult;
};
type FastifyReply = {
  code(statusCode: number): FastifyReply;
  send(payload: unknown): void;
};

/**
 * Fastify plugin that enforces Kakunin certificate validity on all routes.
 * Register before any routes that require certified agent access.
 */
export async function kakuninPlugin(
  fastify: FastifyInstance,
  options: KakuninMiddlewareOptions = {}
): Promise<void> {
  const { requiredScope, attachResult = true } = options;

  fastify.decorateRequest('kakunin', null);

  fastify.addHook('preHandler', async (req, reply) => {
    const headerVal = req.headers['x-kakunin-cert-serial'];
    const serial = Array.isArray(headerVal) ? headerVal[0] : headerVal;

    if (!serial) {
      reply.code(401).send({ error: 'missing_cert_serial' });
      return;
    }

    let result: KakuninVerifyResult;
    try {
      result = await verifyCertificate(serial, options);
    } catch (err) {
      if (err instanceof KakuninVerifyError) {
        reply.code(403).send({ error: 'cert_not_found' });
        return;
      }
      reply.code(503).send({ error: 'verify_unavailable' });
      return;
    }

    if (!result.valid) {
      const errorCode =
        result.status === 'revoked' ? 'agent_revoked' :
        result.status === 'expired' ? 'agent_expired' :
        'agent_inactive';
      reply.code(403).send({ error: errorCode });
      return;
    }

    if (requiredScope && !checkScope(result, requiredScope)) {
      reply.code(403).send({ error: 'scope_violation' });
      return;
    }

    if (attachResult) {
      req.kakunin = result;
    }
  });
}
