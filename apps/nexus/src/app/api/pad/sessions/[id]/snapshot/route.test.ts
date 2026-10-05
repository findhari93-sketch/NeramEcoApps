// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ caller: vi.fn(), callPad: vi.fn(), hint: vi.fn(), away: vi.fn(), meta: vi.fn() }));

vi.mock('@/lib/pad/caller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/caller')>()),
  resolvePadCaller: mocks.caller,
}));
vi.mock('@/lib/pad/sessions', () => ({
  padDb: () => ({}),
  hintSession: mocks.hint,
  loadSessionMeta: mocks.meta,
  rosterFor: async () => ({ ids: ['s1', 's2'], names: { s1: 'Asha', s2: 'Bala' } }),
}));
vi.mock('@/lib/pad/away-today', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/away-today')>()),
  awayToday: mocks.away,
}));
vi.mock('@/lib/pad/rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/rpc')>()),
  callPad: mocks.callPad,
}));

import { GET } from './route';

const SESSION = '11111111-1111-4111-8111-111111111111';
const AWAY = [{ student_id: 's2', name: 'Bala', reason_code: 'clash', label: 'Away until 12 Oct' }];
const get = () =>
  GET(new NextRequest(`http://localhost:3022/api/pad/sessions/${SESSION}/snapshot`, { headers: { Authorization: 'Bearer t' } }), {
    params: { id: SESSION },
  });

beforeEach(() => {
  mocks.caller.mockReset().mockResolvedValue({ user: { id: 'teacher-1' }, role: 'staff', internal: true });
  mocks.meta.mockReset().mockResolvedValue({ id: SESSION, classroom_id: 'c1', batch_id: null, teacher_id: 'teacher-1' });
  mocks.callPad.mockReset().mockResolvedValue({
    ok: true,
    session: { created_at: '2026-10-04T13:26:00Z' },
    readiness: { enrolled: 2, joined: 1 },
    people: { joined: [], not_joined: [] },
  });
  mocks.away.mockReset().mockResolvedValue(AWAY);
  mocks.hint.mockReset();
});

describe('GET /api/pad/sessions/:id/snapshot (teacher)', () => {
  it("adds who declared they are away on the class's Indian day", async () => {
    const body = await (await get()).json();
    expect(body.readiness).toEqual({ enrolled: 2, joined: 1, away: 1 });
    expect(body.people.away).toEqual(AWAY);
    expect(mocks.away).toHaveBeenCalledWith('c1:', { ids: ['s1', 's2'], names: { s1: 'Asha', s2: 'Bala' } }, '2026-10-04');
    expect(mocks.callPad).toHaveBeenCalledWith(expect.anything(), 'pad_teacher_snapshot', expect.objectContaining({ p_roster: ['s1', 's2'] }));
  });

  it('still answers when the away read fails, without the away fields', async () => {
    mocks.away.mockRejectedValue(new Error('db down'));
    const response = await get();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.readiness).toEqual({ enrolled: 2, joined: 1 });
    expect(body.people.away).toBeUndefined();
  });
});
