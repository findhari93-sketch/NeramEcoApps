// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => ({
  table: '',
  columns: '',
  filters: [] as Array<[string, string]>,
  rows: [] as unknown[],
  error: null as unknown,
  reads: 0,
}));

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      db.table = table;
      return {
        select: (columns: string) => {
          db.columns = columns;
          return {
            eq: async (column: string, value: string) => {
              db.reads += 1;
              db.filters.push([column, value]);
              return { data: db.rows, error: db.error };
            },
          };
        },
      };
    },
  }),
}));

vi.mock('@/lib/pad/auto-add', () => ({
  AUTO_ADD_COLUMNS: 'id, classroom_id, scheduled_date',
  sweepClassMeetings: vi.fn(),
}));

import { sweepClassMeetings } from '@/lib/pad/auto-add';
import { GET } from './route';

const SECRET = 'cron-s3cret';
const CLASS_ID = '6a1f3c2e-9b7d-4e21-8c3a-5d2f1e0b9a77';
const call = (query = '', auth: string | null = `Bearer ${SECRET}`) =>
  GET(new NextRequest(`http://localhost:3022/api/cron/pad-meeting-tabs${query}`, { headers: auth ? { Authorization: auth } : {} }));

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  Object.assign(db, { table: '', columns: '', filters: [], rows: [{ id: 'c1' }], error: null, reads: 0 });
  vi.mocked(sweepClassMeetings)
    .mockReset()
    .mockResolvedValue({ considered: 1, due: 1, counts: { added: 1 }, results: [{ classId: 'c1', outcome: 'added' }] });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('GET /api/cron/pad-meeting-tabs', () => {
  it('refuses to run without the secret, or with the wrong one, and reads nothing', async () => {
    delete process.env.CRON_SECRET;
    expect((await call()).status).toBe(503);

    process.env.CRON_SECRET = SECRET;
    expect((await call('', 'Bearer wrong')).status).toBe(401);
    expect((await call('', null)).status).toBe(401);
    expect(db.reads).toBe(0);
    expect(sweepClassMeetings).not.toHaveBeenCalled();
  });

  it("sweeps today's classes by the IST date, inside the time window", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-11T20:00:00Z')); // 01:30 on 12 September in IST

    const response = await call();
    expect(response.status).toBe(200);
    expect(db.table).toBe('nexus_scheduled_classes');
    expect(db.columns).toBe('id, classroom_id, scheduled_date');
    expect(db.filters).toEqual([['scheduled_date', '2026-09-12']]);
    expect(sweepClassMeetings).toHaveBeenCalledWith({ rows: [{ id: 'c1' }], now: new Date('2026-09-11T20:00:00Z'), ignoreWindow: false });
    await expect(response.json()).resolves.toMatchObject({ ok: true, due: 1, counts: { added: 1 } });
  });

  it('runs a single class whatever the time, and only a real class id', async () => {
    expect((await call(`?classId=${CLASS_ID}`)).status).toBe(200);
    expect(db.filters).toEqual([['id', CLASS_ID]]);
    expect(sweepClassMeetings).toHaveBeenCalledWith(expect.objectContaining({ ignoreWindow: true }));

    const bad = await call("?classId=1'or'1'='1");
    expect(bad.status).toBe(400);
    expect(db.reads).toBe(1);
  });

  it('logs classes that failed or lack permissions, without failing the run', async () => {
    vi.mocked(sweepClassMeetings).mockResolvedValue({
      considered: 2,
      due: 2,
      counts: { permission_missing: 1, chat_not_ready: 1 },
      results: [
        { classId: 'c1', outcome: 'permission_missing', reason: 'install the app: 403' },
        { classId: 'c2', outcome: 'chat_not_ready', reason: 'list tabs: 404' },
      ],
    });
    expect((await call()).status).toBe(200);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('could not add'), expect.stringContaining('install the app: 403'));
    expect(String(vi.mocked(console.error).mock.calls[0][1])).not.toContain('c2');
  });

  it('answers a database failure with a plain 500 that leaks nothing', async () => {
    db.error = { message: 'relation "nexus_scheduled_classes" does not exist', code: '42P01' };
    const response = await call();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain('relation');
    expect(sweepClassMeetings).not.toHaveBeenCalled();
  });
});
