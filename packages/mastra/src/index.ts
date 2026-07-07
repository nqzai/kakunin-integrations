/**
 * @kakunin/mastra — Kakunin compliance integration for Mastra
 *
 * Provides KakuninIntegration for use in Mastra agents and workflows.
 * Exposes four tools: verify certificate, check scope, get risk score,
 * emit behavioral event.
 *
 * Usage:
 *   import { KakuninIntegration } from '@kakunin/mastra';
 *
 *   const kakunin = new KakuninIntegration({ apiKey: 'kak_live_...' });
 *
 *   // In a Mastra agent:
 *   const agent = new Agent({
 *     name: 'ComplianceAgent',
 *     tools: kakunin.getTools(),
 *     model: openai('gpt-4o'),
 *   });
 *
 * MCP alternative: Kakunin also exposes a full MCP server at
 * https://www.kakunin.ai/api/mcp — use Mastra's built-in MCP client
 * if you need the complete tool surface without this package.
 *
 * @see https://kakunin.ai/docs/integrations/mastra
 */

import { z } from 'zod';

const DEFAULT_BASE = 'https://api.kakunin.ai/v1';
const AUTHED_BASE = 'https://www.kakunin.ai/api/v1';

export interface KakuninIntegrationConfig {
  /** Kakunin API key (`kak_live_...` or `kak_test_...`). */
  apiKey: string;
  /** Override the API base URL (defaults to production). */
  baseUrl?: string;
}

// ── internal fetch helpers ──────────────────────────────────────────────────

async function apiFetch(
  path: string,
  apiKey: string,
  base: string,
  options?: RequestInit,
): Promise<unknown> {
  const res = await fetch(`${base}${path}`, {
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

// ── KakuninIntegration ──────────────────────────────────────────────────────

/**
 * Kakunin integration for Mastra agents and workflows.
 *
 * Implements the Mastra integration pattern: construct once, call getTools()
 * to receive tool definitions compatible with Mastra's Agent and Workflow APIs.
 */
export class KakuninIntegration {
  private readonly apiKey: string;
  private readonly base: string;

  constructor(config: KakuninIntegrationConfig) {
    this.apiKey = config.apiKey;
    this.base = (config.baseUrl ?? AUTHED_BASE).replace(/\/$/, '');
  }

  /**
   * Returns Mastra-compatible tool definitions for all four Kakunin operations.
   *
   * Pass the returned object directly to a Mastra Agent's `tools` option or
   * spread into your workflow step tools.
   */
  getTools() {
    const { apiKey, base } = this;

    return {
      verifyAgentCertificate: {
        description:
          'Verify the X.509 certificate of an AI agent. Returns certificate status, active scopes, expiry, and revocation state. Use before trusting any agent-signed claim.',
        inputSchema: z.object({
          agentId: z
            .string()
            .describe('Kakunin agent ID (e.g. agt-abc123) or certificate serial number.'),
        }),
        outputSchema: z.unknown(),
        execute: async ({ context }: { context: { agentId: string } }) => {
          // Public verify endpoint — no auth required, <500ms p99
          const res = await fetch(`${DEFAULT_BASE}/verify/${context.agentId}`);
          if (!res.ok) throw new Error(`Kakunin verify error ${res.status}`);
          return res.json();
        },
      },

      checkAgentScope: {
        description:
          "Check whether a specific action is permitted by the agent's active certificate scope. Returns allowed=true/false plus the full permitted scope list. Call before any privileged operation.",
        inputSchema: z.object({
          agentId: z.string().describe('Kakunin agent ID whose scope to check.'),
          action: z
            .string()
            .describe('The action string to verify, e.g. "trade.execute", "data.write".'),
        }),
        outputSchema: z.unknown(),
        execute: async ({ context }: { context: { agentId: string; action: string } }) => {
          const res = (await apiFetch(`/agents/${context.agentId}`, apiKey, base)) as { data: Record<string, unknown> };
          const agent = res.data ?? {};
          const meta = (agent['metadata'] as Record<string, unknown> | null) ?? {};
          const permitted = (meta['permitted_actions'] as string[] | undefined) ?? [];
          return {
            agentId: context.agentId,
            action: context.action,
            allowed: permitted.includes(context.action),
            permittedScopes: permitted,
            agentStatus: agent['status'] ?? 'unknown',
          };
        },
      },

      getBehaviorRiskScore: {
        description:
          'Return the current behavioral risk score for an AI agent. Bands: low (<0.3), medium (>=0.3), high (>=0.75), critical (>=0.85 triggers auto-revocation). Use before high-stakes operations.',
        inputSchema: z.object({
          agentId: z.string().describe('Kakunin agent ID to fetch the risk score for.'),
        }),
        outputSchema: z.unknown(),
        execute: async ({ context }: { context: { agentId: string } }) => {
          const res = (await apiFetch(`/agents/${context.agentId}`, apiKey, base)) as { data: Record<string, unknown> };
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
          return { agentId: context.agentId, score, band };
        },
      },

      emitBehaviorEvent: {
        description:
          "Emit a behavioral event to Kakunin's immutable audit trail. Required for EU AI Act Article 12 compliance logging. Call after every significant agent action.",
        inputSchema: z.object({
          agentId: z.string().describe('Kakunin agent ID performing the action.'),
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
        outputSchema: z.unknown(),
        execute: async ({
          context,
        }: {
          context: { agentId: string; actionType: string; details?: Record<string, unknown> };
        }) => {
          const result = (await apiFetch('/events', apiKey, base, {
            method: 'POST',
            body: JSON.stringify({
              agent_id: context.agentId,
              action_type: context.actionType,
              details: context.details ?? {},
            }),
          })) as Record<string, unknown>;
          return {
            eventId: result['id'],
            agentId: context.agentId,
            actionType: context.actionType,
          };
        },
      },
    };
  }
}

export type KakuninTools = ReturnType<KakuninIntegration['getTools']>;
