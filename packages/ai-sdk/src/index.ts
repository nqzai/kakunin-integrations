/**
 * @kakunin/ai-sdk — Kakunin compliance tools for the Vercel AI SDK
 *
 * Drop-in tools for `generateText()` / `streamText()` that let AI models
 * verify agent certificates, check action scope, read behavioral risk scores,
 * and emit EU AI Act-compliant audit events.
 *
 * Backed by the official [`@kakunin/sdk`](https://www.npmjs.com/package/@kakunin/sdk)
 * client — one source of truth for API calls, auth, retries, and typing.
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
import Kakunin, { type ActionType } from '@kakunin/sdk';

export interface KakuninToolsConfig {
  /** Kakunin API key (`kak_live_...` or `kak_test_...`). */
  apiKey: string;
  /**
   * Default agent ID to use when not provided per-call.
   * Can be overridden by passing `agentId` in each tool call.
   */
  agentId?: string;
  /** Override the API base URL (defaults to the SDK's production base). */
  baseUrl?: string;
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
  const kkn = new Kakunin({
    apiKey: config.apiKey,
    ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
  });

  return {
    verifyAgentCertificate: tool({
      description:
        'Verify the X.509 certificate of an AI agent. Returns certificate status, active scopes, expiry, and revocation state. Use before trusting any agent-signed claim.',
      parameters: z.object({
        serial: z
          .string()
          .describe('Certificate serial number (e.g. c4f9-17a2-6b8e) to verify.'),
      }),
      // Public verify endpoint — no auth, <500ms p99
      execute: async ({ serial }) => kkn.verify.cert(serial),
    }),

    checkAgentScope: tool({
      description:
        'Check whether a specific action is permitted by the agent\'s active certificate scope. Returns allowed=true/false plus the full permitted scope list. Call this before any privileged operation (trade.execute, data.write, etc.).',
      parameters: z.object({
        agentId: z.string().describe('Kakunin agent ID whose scope to check.'),
        action: z
          .string()
          .describe('The action string to verify, e.g. "trade.execute", "data.write", "api_call".'),
      }),
      execute: async ({ agentId, action }) => {
        const agent = await kkn.agents.get(agentId);
        const permitted = (agent.metadata['permitted_actions'] as string[] | undefined) ?? [];
        return {
          agentId,
          action,
          allowed: permitted.includes(action),
          permittedScopes: permitted,
          agentStatus: agent.status,
        };
      },
    }),

    getBehaviorRiskScore: tool({
      description:
        'Return the current behavioral risk score for an AI agent over the rolling 30-day window, plus its risk band (low/medium/high). Use before high-stakes operations.',
      parameters: z.object({
        agentId: z.string().describe('Kakunin agent ID to fetch the risk score for.'),
      }),
      execute: async ({ agentId }) => {
        const risk = await kkn.agents.getRisk(agentId);
        return {
          agentId,
          score: risk.avg_score,
          band: risk.dominant_band,
          highRiskEventCount: risk.high_risk_event_count,
        };
      },
    }),

    emitBehaviorEvent: tool({
      description:
        'Emit a behavioral event to Kakunin\'s immutable audit trail. Required for EU AI Act Article 12 compliance logging. Call after every significant agent action. Returns the event\'s risk band.',
      parameters: z.object({
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
      execute: async ({ agentId, actionType, details }) => {
        const result = await kkn.events.ingest({
          agentId,
          actionType: actionType as ActionType,
          ...(details !== undefined ? { details } : {}),
        });
        return {
          eventId: result.event_id,
          agentId,
          actionType,
          riskBand: result.risk_band,
        };
      },
    }),
  };
}

export type KakuninTools = ReturnType<typeof createKakuninTools>;
