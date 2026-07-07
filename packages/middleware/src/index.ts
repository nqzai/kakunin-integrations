/**
 * @kakunin/middleware
 *
 * Express, Fastify, and Next.js middleware for Kakunin AI agent certificate enforcement.
 * Reads X-Kakunin-Cert-Serial header, verifies via public API, rejects revoked/expired agents.
 *
 * @see https://kakunin.ai/docs/enforcement
 */

export {
  verifyCertificate,
  checkScope,
  KakuninVerifyError,
  KakuninCertNotFoundError,
  VERIFY_BASE_URL,
} from './verify.js';

export type {
  KakuninVerifyResult,
  KakuninMiddlewareOptions,
} from './verify.js';

// Re-export adapters for convenience
export { kakuninGateway } from './express.js';
export { kakuninPlugin } from './fastify.js';
export { withKakunin } from './next.js';
export type { WithKakuninOptions } from './next.js';
