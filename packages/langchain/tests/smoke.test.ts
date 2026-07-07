import { describe, it, expect } from 'vitest';
import {
  KakuninToolGuard,
  KakuninScopeCallbackHandler,
  langchainScopeCallback,
  ScopeViolationError,
} from '../src/index.js';

describe('@kakunin/langchain', () => {
  it('exports the guard, callback handler, and helpers', () => {
    expect(KakuninToolGuard).toBeTypeOf('function');
    expect(KakuninScopeCallbackHandler).toBeTypeOf('function');
    expect(langchainScopeCallback).toBeTypeOf('function');
    expect(new ScopeViolationError('x', [])).toBeInstanceOf(Error);
  });
});
