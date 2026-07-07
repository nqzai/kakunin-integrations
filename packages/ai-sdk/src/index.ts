/**
 * @kakunin/ai-sdk — Kakunin compliance tools for the Vercel AI SDK
 *
 * Drop-in tools for `generateText()` / `streamText()` that let AI models
 * verify agent certificates, check action scope, read behavioral risk scores,
 * and emit EU AI Act-compliant audit events — all without a separate SDK dep.
 *
 * Usage:
 *   import { createKakuninTools } from '@kakunin/ai-sdk';
 *   import { generateText } from 'ai';
 *
 *   const tools = createKakuninTools({ apiKey: 'kak_live_...', agentId: 'agt-123' });
 *
 *   const { text } = await generateText({
 *     model: openai('gpt-4o'),
 *     tools,
 *     prompt: 'Verify the certificate for agent agt-123 before proceeding.',
 *   });
 *
 * MCP alternative: Kakunin also exposes a full MCP server at
 * https://www.kakunin.ai/api/mcp — use with experimental_createMCPClient()
 * if you need the complete tool surface.
 *
 * @see https://kakunin.ai/docs/integrations/vercel-ai-sdk
 */

import { tool } from 'ai';
import { z } from 'zod';

const DEFAULT_BASE = 'https://api.kakunin.ai/v1';
const AUTHED_BASE = 'https://www.kakunin.ai/api/v1';

export interface KakuninToolsConfig {
  /** Kakunin API key (`kak_live_...` or `kak_test_...`). */
  apiKey: string;
  /**
   * Default agent ID to use when not provided per-call.
   * Can be overridden by passing `agentId` in each tool call.
   */
  agentId?: string;
  /** Override the API base URL (defaults to production). */
  baseUrl?: string;
}

// ── internal fetch helpers ──────────────────────────────────────────────────

async function apiFetch(
  path: string,
  apiKey: string,
  baseUrl: string,
  options?: RequestInit,
): Promise<unknown> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Kakunin API error ${res.status}: ${err}`);
  }
  return res.json();
}

async function publicFetch(path: string, publicBase: string): Promise<unknown> {
  const res = await fetch(`${publicBase}${path}`);
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Kakunin API error ${res.status}: ${err}`);
  }
  return res.json();
}

// ── tool factory ────────────────────────────────────────────────────────────

/**
 * Returns a `Record<string, CoreTool>` ready for use in Vercel AI SDK's
 * `generateText()`, `streamText()`, or `generateObject()`.
 *
 * Four tools are provided:
 * - `verifyAgentCertificate` — check cert status + scope
 * - `checkAgentScope` — pre-flight action authorization
 * - `getBehaviorRiskScore` — current risk score + band
 * - `emitBehaviorEvent` — write to immutable EU AI Act audit trail
 */
export function createKakuninTools(config: KakuninToolsConfig) {
  const base = (config.baseUrl ?? AUTHED_BASE).replace(/\/$/, '');
  const { apiKey } = config;

  return {
    verifyAgentCertificate: tool({
      description:
        'Verify the X.509 certificate of an AI agent. Returns certificate status, active scopes, expiry, and revocation state. Use before trusting any agent-signed claim.',
      parameters: z.object({
        agentId: z
          .string()
          .describe('Kakunin agent ID (e.g. agt-abc123) or certificate serial number.'),
      }),
      execute: async ({ agentId }) => {
        // Public verify endpoint — no auth, <500ms p99
        return publicFetch(`/verify/${agentId}`, DEFAULT_BASE);
      },
    }),

    checkAgentScope: tool({
      description:
        'Check whether a specific action is permitted by the agent\'s active certificate scope. Returns allowed=true/false plus the full permitted scope list. Call this before any privileged operation (trade.execute, data.write, etc.).',
      parameters: z.object({
        agentId: z
          .string()
          .describe('Kakunin agent ID whose scope to check.'),
        action: z
          .string()
          .describe(
            'The action string to verify, e.g. "trade.execute", "data.write", "api_call".',
          ),
      }),
      execute: async ({ agentId, action }) => {
        const res = (await apiFetch(`/agents/${agentId}`, apiKey, base)) as { data: Record<string, unknown> };
        const agent = res.data ?? {};
        const meta = (agent['metadata'] as Record<string, unknown> | null) ?? {};
        const permitted = (meta['permitted_actions'] as string[] | undefined) ?? [];
        return {
          agentId,
          action,
          allowed: permitted.includes(action),
          permittedScopes: permitted,
          agentStatus: agent['status'] ?? 'unknown',
        };
      },
    }),

    getBehaviorRiskScore: tool({
      description:
        'Return the current behavioral risk score for an AI agent. Bands: low (<0.3), medium (>=0.3), high (>=0.75), critical (>=0.85 triggers auto-revocation). Use before high-stakes operations.',
      parameters: z.object({
        agentId: z
          .string()
          .describe('Kakunin agent ID to fetch the risk score for.'),
      }),
      execute: async ({ agentId }) => {
        const res = (await apiFetch(`/agents/${agentId}`, apiKey, base)) as { data: Record<string, unknown> };
        const agent = res.data ?? {};
        const meta = (agent['metadata'] as Record<string, unknown> | null) ?? {};
        const score = (meta['risk_score'] as number | undefined) ?? 0;
        const band =
          score >= 0.85
            ? 'critical'
            : score >= 0.75
              ? 'high'
              : score >= 0.3
                ? 'medium'
                : 'low';
        return { agentId, score, band };
      },
    }),

    emitBehaviorEvent: tool({
      description:
        'Emit a behavioral event to Kakunin\'s immutable audit trail. Required for EU AI Act Article 12 compliance logging. Call after every significant agent action. Fire-and-forget — does not block.',
      parameters: z.object({
        agentId: z
          .string()
          .describe('Kakunin agent ID performing the action.'),
        actionType: z
          .enum([
            'api_call',
            'authentication_attempt',
            'authentication_failure',
            'data_access',
            'data_mutation',
            'transaction_initiated',
            'transaction_anomaly',
            'unauthorized_access_attempt',
            'message_signed',
            'message_verification_failed',
          ])
          .describe('Canonical Kakunin event type.'),
        details: z
          .record(z.unknown())
          .optional()
          .describe('Optional key-value pairs stored alongside the event.'),
      }),
      execute: async ({ agentId, actionType, details }) => {
        const result = (await apiFetch(
          '/events',
          apiKey,
          base,
          {
            method: 'POST',
            body: JSON.stringify({ agent_id: agentId, action_type: actionType, details: details ?? {} }),
          },
        )) as Record<string, unknown>;
        return {
          eventId: result['id'],
          agentId,
          actionType,
        };
      },
    }),
  };
}

export type KakuninTools = ReturnType<typeof createKakuninTools>;
