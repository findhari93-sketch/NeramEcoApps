import { afterEach, describe, expect, it, vi } from 'vitest';

const pipeline = vi.hoisted(() => ({
  agentContext: vi.fn(async () => ({})),
  historyFromError: vi.fn(() => null),
  runIngest: vi.fn(async () => ({ ok: true })),
  runAnalyze: vi.fn(async () => ({ ok: true })),
  runConversions: vi.fn(),
  runWeekly: vi.fn(),
}));
vi.mock('@/lib/marketing-ai/pipeline', () => pipeline);
vi.mock('@/lib/marketing-ai/store', () => ({ db: vi.fn(), latestRuns: vi.fn() }));

import { POST } from './route';

const audit = () =>
  POST(
    new Request('http://x/api/marketing-ai/runs', {
      method: 'POST',
      headers: { 'x-neram-admin-id': 'a1', 'x-neram-admin-type': 'admin', 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'audit' }),
    }) as any,
  );

describe('POST /api/marketing-ai/runs', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('refuses a manual audit on production until Google Ads is live, so the sample account never lands in prod', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('GOOGLE_ADS_MODE', 'mock');
    const res = await audit();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Connect Google Ads first/);
    expect(pipeline.runIngest).not.toHaveBeenCalled();
  });

  it('still runs the sample audit on staging for demos', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('GOOGLE_ADS_MODE', 'mock');
    const res = await audit();
    expect(res.status).toBe(200);
    expect(pipeline.runIngest).toHaveBeenCalledOnce();
    expect(pipeline.runAnalyze).toHaveBeenCalledOnce();
  });
});
