import { describe, it, expect } from 'vitest';
import { createKakuninTools } from '../src/index.js';

describe('@kakunin/ai-sdk', () => {
  it('creates tools for the Vercel AI SDK', () => {
    const tools = createKakuninTools({ apiKey: 'kak_test_x' });
    expect(tools).toBeTypeOf('object');
    expect(Object.keys(tools).length).toBeGreaterThan(0);
  });
});
