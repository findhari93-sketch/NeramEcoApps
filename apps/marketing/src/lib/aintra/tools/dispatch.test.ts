import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./get-college', () => ({
  getCollegeTool: vi.fn(async () => ({ ok: true, data: { name: 'X' } })),
}));
vi.mock('./search-colleges', () => ({
  searchCollegesTool: vi.fn(async () => ({ ok: true, data: { count: 0, results: [] } })),
}));
vi.mock('./compare-colleges', () => ({
  compareCollegesTool: vi.fn(async () => ({ ok: true, data: [] })),
}));

import { dispatchTool } from './dispatch';

describe('dispatchTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes get_college', async () => {
    const r = await dispatchTool('get_college', { slug: 'x' });
    expect(r.ok).toBe(true);
  });

  it('routes search_colleges', async () => {
    const r = await dispatchTool('search_colleges', { state: 'tamil-nadu' });
    expect(r.ok).toBe(true);
  });

  it('routes compare_colleges', async () => {
    const r = await dispatchTool('compare_colleges', { slugs: ['a', 'b'] });
    expect(r.ok).toBe(true);
  });

  it('returns unknown_tool for unrecognized name', async () => {
    const r = await dispatchTool('not_a_tool' as any, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('unknown_tool');
  });

  it('enforces 3-second timeout', async () => {
    const { getCollegeTool } = await import('./get-college');
    (getCollegeTool as any).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, data: {} }), 5000))
    );
    const r = await dispatchTool('get_college', { slug: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('timeout');
  }, 10000);
});
