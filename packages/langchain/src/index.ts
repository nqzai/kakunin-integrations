/**
 * @kakunin/langchain — Kakunin compliance tools for LangChain JS/TS
 *
 * Provides KakuninToolGuard and KakuninScopeCallbackHandler to verify agent certificates
 * and scope boundaries before LangChain tool and chain execution.
 *
 * Usage:
 *   import { KakuninToolGuard } from '@kakunin/langchain';
 *   import { Kakunin } from '@kakunin/sdk';
 *
 *   const kkn = new Kakunin({ apiKey: 'kak_live_...' });
 *   const guardedTool = new KakuninToolGuard({
 *     kakunin: kkn,
 *     agentId: 'agt-123',
 *     tool: myLangchainTool,
 *     requiredScopes: ['trade.execute']
 *   });
 */

import { StructuredTool } from '@langchain/core/tools';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Kakunin } from '@kakunin/sdk';

export class ScopeViolationError extends Error {
  constructor(
    message: string,
    public agentId: string,
    public agentStatus?: string,
    public missingScopes?: string[]
  ) {
    super(message);
    this.name = 'ScopeViolationError';
    Object.setPrototypeOf(this, ScopeViolationError.prototype);
  }
}

export class KakuninToolGuard extends StructuredTool {
  name: string;
  description: string;
  schema: StructuredTool['schema'];
  private kakunin: Kakunin;
  private agentId: string;
  private tool: StructuredTool;
  private requiredScopes?: string[];

  constructor(config: {
    kakunin: Kakunin;
    agentId: string;
    tool: StructuredTool;
    requiredScopes?: string[];
  }) {
    super();
    this.kakunin = config.kakunin;
    this.agentId = config.agentId;
    this.tool = config.tool;
    this.requiredScopes = config.requiredScopes;

    this.name = config.tool.name;
    this.description = config.tool.description;
    this.schema = config.tool.schema;
  }

  async checkScope(): Promise<void> {
    const agent = await this.kakunin.agents.get(this.agentId);
    if (agent.status !== 'active') {
      throw new ScopeViolationError(
        `Agent "${this.agentId}" is "${agent.status}" — only active agents may execute guarded operations.`,
        this.agentId,
        agent.status
      );
    }

    if (this.requiredScopes && this.requiredScopes.length > 0) {
      const metadata = agent.metadata as Record<string, unknown> | undefined;
      const permitted = (metadata?.scopes as string[] | undefined) || [];
      const missing = this.requiredScopes.filter((s) => !permitted.includes(s));
      if (missing.length > 0) {
        throw new ScopeViolationError(
          `Agent "${this.agentId}" missing required scopes: ${missing.join(', ')}. Permitted: ${permitted.join(', ')}`,
          this.agentId,
          agent.status,
          missing
        );
      }
    }
  }

  protected async _call(input: unknown, runManager?: unknown): Promise<string> {
    await this.checkScope();
    return (this.tool as unknown as { _call: (i: unknown, r?: unknown) => Promise<string> })._call(input, runManager);
  }
}

export class KakuninScopeCallbackHandler extends BaseCallbackHandler {
  name = 'kakunin_scope_callback_handler';

  constructor(
    private kakunin: Kakunin,
    private agentId: string,
    private requiredScopes?: string[]
  ) {
    super();
  }

  async handleChainStart(): Promise<void> {
    const agent = await this.kakunin.agents.get(this.agentId);
    if (agent.status !== 'active') {
      throw new ScopeViolationError(
        `Agent "${this.agentId}" is "${agent.status}" — only active agents may execute guarded operations.`,
        this.agentId,
        agent.status
      );
    }

    if (this.requiredScopes && this.requiredScopes.length > 0) {
      const metadata = agent.metadata as Record<string, unknown> | undefined;
      const permitted = (metadata?.scopes as string[] | undefined) || [];
      const missing = this.requiredScopes.filter((s) => !permitted.includes(s));
      if (missing.length > 0) {
        throw new ScopeViolationError(
          `Agent "${this.agentId}" missing required scopes: ${missing.join(', ')}. Permitted: ${permitted.join(', ')}`,
          this.agentId,
          agent.status,
          missing
        );
      }
    }
  }
}

export function langchainScopeCallback(
  kakunin: Kakunin,
  agentId: string,
  config?: { requiredScopes?: string[] }
): KakuninScopeCallbackHandler {
  return new KakuninScopeCallbackHandler(kakunin, agentId, config?.requiredScopes);
}
