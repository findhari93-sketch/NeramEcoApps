import { afterEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => {
  const q: any = {};
  for (const m of ['from', 'select', 'order', 'limit', 'in', 'eq']) q[m] = vi.fn(() => q);
  q.then = (resolve: any) => resolve({ data: [], error: null });
  return q;
});
vi.mock('@/lib/marketing-ai/store', () => ({ db: () => query }));

import { GET } from './route';

const list = () =>
  GET(
    new Request('http://x/api/marketing-ai/recommendations', {
      headers: { 'x-neram-admin-id': 'a1', 'x-neram-admin-type': 'admin' },
    }) as any,
  );

describe('GET /api/marketing-ai/recommendations', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('tells the page production is waiting for Google Ads, so it does not claim a sample account', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('GOOGLE_ADS_MODE', 'mock');
    const body = await (await list()).json();
    expect(body.connection.runsBlocked).toBe(true);
  });

  it('is not blocked on staging, where the sample account is real demo data', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('GOOGLE_ADS_MODE', 'mock');
    const body = await (await list()).json();
    expect(body.connection.runsBlocked).toBe(false);
  });
});
