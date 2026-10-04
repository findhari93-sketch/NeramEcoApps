// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { fakeDb } from '@/lib/assistant/testing/fake-db';

const mocks = vi.hoisted(() => ({
  verifyMsToken: vi.fn(),
  upsertNexusSetting: vi.fn(),
  loadAssistantMonthUsage: vi.fn(),
  loadAiAccess: vi.fn(),
  db: null as any,
}));

vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: mocks.verifyMsToken }));
vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => mocks.db,
  upsertNexusSetting: mocks.upsertNexusSetting,
}));
vi.mock('@/lib/assistant/usage', () => ({ loadAssistantMonthUsage: mocks.loadAssistantMonthUsage }));
vi.mock('@/lib/assistant/ai-access', async (orig) => ({
  ...(await orig<typeof import('@/lib/assistant/ai-access')>()),
  loadAiAccess: mocks.loadAiAccess,
}));

import { GET, PATCH } from './route';

const req = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/admin/ai-usage/assistant', {
    method,
    headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const staff = [
  { id: 'a1', ms_oid: 'oid', user_type: 'admin', staff_role: 'admin', can_teach: true, name: 'Admin' },
  { id: 't1', ms_oid: 'teacher-oid', user_type: 'teacher', staff_role: 'teacher', can_teach: true, name: 'Teacher' },
  { id: 's1', name: 'Priya' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db = fakeDb({ users: staff, nexus_settings: [], nexus_assistant_ai_overrides: [] });
  mocks.verifyMsToken.mockResolvedValue({ oid: 'oid' });
});

describe('/api/admin/ai-usage/assistant', () => {
  it('401 with no token, 403 for a teacher without system.settings', async () => {
    mocks.verifyMsToken.mockRejectedValueOnce(new Error('no token'));
    expect((await GET(req('GET'))).status).toBe(401);
    mocks.verifyMsToken.mockResolvedValueOnce({ oid: 'teacher-oid' });
    expect((await GET(req('GET'))).status).toBe(403);
    mocks.verifyMsToken.mockResolvedValueOnce({ oid: 'teacher-oid' });
    expect((await PATCH(req('PATCH', { dailyLimit: 5 }))).status).toBe(403);
  });

  it('GET returns the allowance, the students with their access line, and active overrides', async () => {
    mocks.loadAssistantMonthUsage.mockResolvedValue([{ studentId: 's1', name: 'Priya', questions: 12, costUsd: 0.01 }]);
    mocks.loadAiAccess.mockResolvedValue({ on: true, reason: 'caught_up', sentence: '', link: null, missed: [], missedCount: 0, deficit: 0, override: null });
    const res = await GET(req('GET'));
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json();
    expect(body).toMatchObject({ dailyLimit: 10, students: [{ studentId: 's1', questions: 12, access: 'On: all caught up.' }] });
  });

  it('GET lists only live overrides with names', async () => {
    mocks.loadAssistantMonthUsage.mockResolvedValue([]);
    mocks.db = fakeDb({
      users: staff,
      nexus_settings: [],
      nexus_assistant_ai_overrides: [
        { id: 'o1', student_id: 's1', mode: 'on', reason: 'exam week', set_by: 't1', set_at: '2026-10-03T00:00:00Z', ends_on: '2999-01-01', cleared_at: null },
        { id: 'o2', student_id: 's1', mode: 'off', reason: 'old', set_by: 't1', set_at: '2026-09-01T00:00:00Z', ends_on: '2020-01-01', cleared_at: null },
      ],
    });
    const body = await (await GET(req('GET'))).json();
    expect(body.overrides).toEqual([
      { studentId: 's1', studentName: 'Priya', mode: 'on', reason: 'exam week', setByName: 'Teacher', setAt: '2026-10-03T00:00:00Z', endsOn: '2999-01-01' },
    ]);
  });

  it('PATCH clamps and stores the allowance', async () => {
    const res = await PATCH(req('PATCH', { dailyLimit: 99 }));
    expect(await res.json()).toEqual({ dailyLimit: 50 });
    expect(mocks.upsertNexusSetting).toHaveBeenCalledWith('assistant_ai_daily_limit', 50, 'a1');
  });

  it('PATCH rejects a non-number with 400 and stores nothing', async () => {
    const res = await PATCH(req('PATCH', { dailyLimit: 'lots' }));
    expect(res.status).toBe(400);
    expect(mocks.upsertNexusSetting).not.toHaveBeenCalled();
  });

  it('never sends raw database text to the client', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.loadAssistantMonthUsage.mockRejectedValue({ message: 'relation "nexus_assistant_messages" does not exist', code: '42P01' });
    const res = await GET(req('GET'));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('nexus_assistant_messages');
    expect(JSON.parse(text)).toEqual({ error: 'Something went wrong. Please try again.' });
    expect(spy).toHaveBeenCalledWith('[ai-usage assistant]', expect.stringContaining('42P01'));
    spy.mockRestore();
  });
});
