import { describe, it, expect } from 'vitest';
import { KakuninIntegration } from '../src/index.js';

describe('@kakunin/mastra', () => {
  it('constructs and exposes tools', () => {
    const kkn = new KakuninIntegration({ apiKey: 'kak_test_x' });
    const tools = kkn.getTools();
    expect(tools).toBeTypeOf('object');
    expect(Object.keys(tools).length).toBeGreaterThan(0);
  });
});
