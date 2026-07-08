/**
 * @kakunin/mastra — Kakunin compliance integration for Mastra
 *
 * Provides KakuninIntegration for use in Mastra agents and workflows.
 * Exposes four tools: verify certificate, check scope, get risk score,
 * emit behavioral event.
 *
 * Backed by the official [`@kakunin/sdk`](https://www.npmjs.com/package/@kakunin/sdk)
 * client — one source of truth for API calls, auth, retries, and typing.
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
import Kakunin, { type ActionType } from '@kakunin/sdk';

export interface KakuninIntegrationConfig {
  /** Kakunin API key (`kak_live_...` or `kak_test_...`). */
  apiKey: string;
  /** Override the API base URL (defaults to the SDK's production base). */
  baseUrl?: string;
}

// ── KakuninIntegration ──────────────────────────────────────────────────────

/**
 * Kakunin integration for Mastra agents and workflows.
 *
 * Implements the Mastra integration pattern: construct once, call getTools()
 * to receive tool definitions compatible with Mastra's Agent and Workflow APIs.
 */
export class KakuninIntegration {
  private readonly kkn: Kakunin;

  constructor(config: KakuninIntegrationConfig) {
    this.kkn = new Kakunin({
      apiKey: config.apiKey,
      ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
    });
  }

  /**
   * Returns Mastra-compatible tool definitions for all four Kakunin operations.
   *
   * Pass the returned object directly to a Mastra Agent's `tools` option or
   * spread into your workflow step tools.
   */
  getTools() {
    const kkn = this.kkn;

    return {
      verifyAgentCertificate: {
        description:
          'Verify the X.509 certificate of an AI agent. Returns certificate status, active scopes, expiry, and revocation state. Use before trusting any agent-signed claim.',
        inputSchema: z.object({
          serial: z
            .string()
            .describe('Certificate serial number (e.g. c4f9-17a2-6b8e) to verify.'),
        }),
        outputSchema: z.unknown(),
        execute: async ({ context }: { context: { serial: string } }) =>
          // Public verify endpoint — no auth required, <500ms p99
          kkn.verify.cert(context.serial),
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
          const agent = await kkn.agents.get(context.agentId);
          const permitted = (agent.metadata['permitted_actions'] as string[] | undefined) ?? [];
          return {
            agentId: context.agentId,
            action: context.action,
            allowed: permitted.includes(context.action),
            permittedScopes: permitted,
            agentStatus: agent.status,
          };
        },
      },

      getBehaviorRiskScore: {
        description:
          'Return the current behavioral risk score for an AI agent over the rolling 30-day window, plus its risk band (low/medium/high). Use before high-stakes operations.',
        inputSchema: z.object({
          agentId: z.string().describe('Kakunin agent ID to fetch the risk score for.'),
        }),
        outputSchema: z.unknown(),
        execute: async ({ context }: { context: { agentId: string } }) => {
          const risk = await kkn.agents.getRisk(context.agentId);
          return {
            agentId: context.agentId,
            score: risk.avg_score,
            band: risk.dominant_band,
            highRiskEventCount: risk.high_risk_event_count,
          };
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
            .record(z.string(), z.unknown())
            .optional()
            .describe('Optional key-value pairs stored alongside the event.'),
        }),
        outputSchema: z.unknown(),
        execute: async ({
          context,
        }: {
          context: { agentId: string; actionType: string; details?: Record<string, unknown> };
        }) => {
          const result = await kkn.events.ingest({
            agentId: context.agentId,
            actionType: context.actionType as ActionType,
            ...(context.details !== undefined ? { details: context.details } : {}),
          });
          return {
            eventId: result.event_id,
            agentId: context.agentId,
            actionType: context.actionType,
            riskBand: result.risk_band,
          };
        },
      },
    };
  }
}

export type KakuninTools = ReturnType<KakuninIntegration['getTools']>;
