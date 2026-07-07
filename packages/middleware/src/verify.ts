/**
 * Core certificate verification logic for @kakunin/middleware.
 *
 * Calls GET https://kakunin.ai/api/v1/verify/{serial} (public, no auth).
 * In-process LRU cache with configurable TTL to keep p99 < 5ms on cache hits.
 */

export const VERIFY_BASE_URL = 'https://kakunin.ai/api/v1/verify';

export interface KakuninVerifyResult {
  valid: boolean;
  status: 'active' | 'revoked' | 'expired' | 'suspended';
  serial_number: string;
  agent: {
    id: string;
    name: string;
    model?: string;
    version?: string;
    permitted_actions?: string[];
    financial_scope?: {
      max_transaction_usd?: number;
      daily_limit_usd?: number;
      currency?: string;
    };
  } | null;
  expires_at: string;
  revoked_at?: string;
  revocation_reason?: string;
}

export interface KakuninMiddlewareOptions {
  /**
   * Required permitted_action value. If set, requests from agents without
   * this action in their cert scope are rejected with 403 scope_violation.
   */
  requiredScope?: string;
  /**
   * In-process cache TTL in milliseconds. Default: 5000 (5s).
   * Set to 0 to disable caching (not recommended for high-traffic routes).
   */
  cacheMs?: number;
  /**
   * Custom base URL for the verify endpoint. Useful for testing or self-hosted.
   * Default: https://kakunin.ai/api/v1/verify
   */
  verifyBaseUrl?: string;
  /**
   * If true, attaches the verify result to req.kakunin (Express/Fastify)
   * or request headers (Next.js). Default: true.
   */
  attachResult?: boolean;
}

// ── Simple in-process LRU cache ─────────────────────────────────────────────

interface CacheEntry {
  result: KakuninVerifyResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 1000;

function cacheGet(key: string): KakuninVerifyResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

function cacheSet(key: string, result: KakuninVerifyResult, ttlMs: number): void {
  // Evict oldest entry if at capacity
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, { result, expiresAt: Date.now() + ttlMs });
}

// ── Core verify function ─────────────────────────────────────────────────────

export async function verifyCertificate(
  serial: string,
  options: KakuninMiddlewareOptions = {}
): Promise<KakuninVerifyResult> {
  const ttlMs = options.cacheMs ?? 5000;
  const baseUrl = options.verifyBaseUrl ?? VERIFY_BASE_URL;

  // Cache hit
  if (ttlMs > 0) {
    const cached = cacheGet(serial);
    if (cached) return cached;
  }

  const url = `${baseUrl}/${encodeURIComponent(serial)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': '@kakunin/middleware/0.1.0' },
    // Use native fetch signal for a 10s timeout
    signal: AbortSignal.timeout(10_000),
  });

  if (res.status === 404) {
    throw new KakuninCertNotFoundError(serial);
  }
  if (!res.ok) {
    throw new KakuninVerifyError(`Verify endpoint returned ${res.status}`);
  }

  const json = (await res.json()) as { data: KakuninVerifyResult };
  const result = json.data;

  if (ttlMs > 0) {
    cacheSet(serial, result, ttlMs);
  }

  return result;
}

// ── Scope check ─────────────────────────────────────────────────────────────

export function checkScope(result: KakuninVerifyResult, requiredScope: string): boolean {
  const actions = result.agent?.permitted_actions;
  if (!actions || actions.length === 0) return false;
  return actions.includes(requiredScope);
}

// ── Errors ──────────────────────────────────────────────────────────────────

export class KakuninVerifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KakuninVerifyError';
  }
}

export class KakuninCertNotFoundError extends KakuninVerifyError {
  readonly serial: string;
  constructor(serial: string) {
    super(`Certificate not found: ${serial}`);
    this.name = 'KakuninCertNotFoundError';
    this.serial = serial;
  }
}
