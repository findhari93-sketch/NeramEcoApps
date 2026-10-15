import { afterEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  loadRoi: vi.fn(async () => ({ months: [], total: {} })),
  saveManualSpend: vi.fn(async (_db: unknown, month: string, amount: number | null) => (amount === null ? {} : { [month]: amount })),
}));
vi.mock('@/lib/marketing-ai/roi-store', () => store);
vi.mock('@/lib/marketing-ai/store', () => ({ db: vi.fn(() => ({})) }));

import { GET } from './route';
import { PUT } from './spend/route';

const ADMIN = { 'x-neram-admin-id': 'a1', 'x-neram-admin-type': 'admin' };
const TEACHER = { 'x-neram-admin-id': 't1', 'x-neram-admin-type': 'teacher' };
const get = (headers: Record<string, string>) => GET(new Request('http://x/api/marketing-ai/roi', { headers }) as any);
const put = (body: unknown, headers: Record<string, string> = ADMIN) =>
  PUT(new Request('http://x/api/marketing-ai/roi/spend', { method: 'PUT', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) }) as any);

describe('/api/marketing-ai/roi', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('is for admins only', async () => {
    expect((await get(TEACHER)).status).toBe(403);
    expect((await put({ month: '2026-10', amount: 100 }, TEACHER)).status).toBe(403);
    expect(store.saveManualSpend).not.toHaveBeenCalled();
  });

  it('returns the report with a timestamp', async () => {
    const res = await get(ADMIN);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ months: [], generatedAt: expect.any(String) });
  });

  it('saves a valid month and refuses a future month or a negative amount', async () => {
    const ok = await put({ month: '2026-10', amount: 6480 });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ spend: { '2026-10': 6480 } });
    expect(store.saveManualSpend).toHaveBeenCalledWith(expect.anything(), '2026-10', 6480, 'a1');

    expect((await put({ month: '2999-01', amount: 10 })).status).toBe(400);
    expect((await put({ month: '2026-10', amount: -5 })).status).toBe(400);
    expect(store.saveManualSpend).toHaveBeenCalledTimes(1);
  });
});
