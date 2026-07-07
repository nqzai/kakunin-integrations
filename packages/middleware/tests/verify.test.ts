import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyCertificate, checkScope, KakuninCertNotFoundError, KakuninVerifyError } from '../src/verify.js';

const mockActiveResult = {
  valid: true,
  status: 'active' as const,
  serial_number: '3A:F2:91:CC',
  agent: {
    id: 'agt_01',
    name: 'Test Agent',
    permitted_actions: ['transactions:write', 'data:read'],
  },
  expires_at: new Date(Date.now() + 86400000).toISOString(),
};

const _mockRevokedResult = {
  ...mockActiveResult,
  valid: false,
  status: 'revoked' as const,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('verifyCertificate', () => {
  it('returns result for active cert', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: mockActiveResult }),
    }));

    const result = await verifyCertificate('3A:F2:91:CC', { cacheMs: 0 });
    expect(result.valid).toBe(true);
    expect(result.status).toBe('active');
  });

  it('throws KakuninCertNotFoundError on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }));

    await expect(verifyCertificate('UNKNOWN', { cacheMs: 0 })).rejects.toThrow(KakuninCertNotFoundError);
  });

  it('throws KakuninVerifyError on non-404 error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }));

    await expect(verifyCertificate('SERIAL', { cacheMs: 0 })).rejects.toThrow(KakuninVerifyError);
  });

  it('returns cached result on second call', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: mockActiveResult }),
    });
    vi.stubGlobal('fetch', fetchMock);

    // First call — network
    await verifyCertificate('CACHED_SERIAL', { cacheMs: 5000 });
    // Second call — cache hit
    await verifyCertificate('CACHED_SERIAL', { cacheMs: 5000 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips cache when cacheMs=0', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: mockActiveResult }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await verifyCertificate('NO_CACHE', { cacheMs: 0 });
    await verifyCertificate('NO_CACHE', { cacheMs: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('checkScope', () => {
  it('returns true when scope present', () => {
    expect(checkScope(mockActiveResult, 'transactions:write')).toBe(true);
  });

  it('returns false when scope missing', () => {
    expect(checkScope(mockActiveResult, 'admin:write')).toBe(false);
  });

  it('returns false when no permitted_actions', () => {
    const noScope = { ...mockActiveResult, agent: { id: 'x', name: 'x' } };
    expect(checkScope(noScope, 'transactions:write')).toBe(false);
  });

  it('returns false when agent is null', () => {
    const noAgent = { ...mockActiveResult, agent: null };
    expect(checkScope(noAgent, 'transactions:write')).toBe(false);
  });
});
