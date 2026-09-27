import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * GET /api/students/[id]/activity: the cross-app history on the staff profile.
 * Same gate as the core profile route, a 401 (not a 500) for a bad token, and
 * the fee gate holds: a teacher never receives a payment row or a CRM note.
 */

const getRequestUser = vi.fn();
const getUserTimeline = vi.fn();
const results: Record<string, unknown> = {};

function table(name: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'limit']) b[m] = () => b;
  b.maybeSingle = async () => results[name] ?? { data: null, error: null };
  return b;
}

vi.mock('@/lib/study-materials', async () => {
  const caps = await vi.importActual<typeof import('@/lib/staff-capabilities')>('@/lib/staff-capabilities');
  const has = (u: { staff_role: string | null; user_type: string | null; can_teach: boolean | null }, c: string) =>
    caps.can(caps.resolveStaffRole(u as never), c as never, u.can_teach !== false);
  return {
    getRequestUser: (...a: unknown[]) => getRequestUser(...a),
    hasCapability: has,
    assertCapability: (u: never, c: string) => {
      if (!has(u, c)) throw Object.assign(new Error(`Not authorized: this action requires ${c}.`), {});
    },
  };
});
vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: (name: string) => table(name) }),
  getUserTimeline: (...a: unknown[]) => getUserTimeline(...a),
  EVENT_LABELS: { tool_completed: 'Used a tool' },
}));

import { GET } from './route';

const teacher = { id: 't1', user_type: 'teacher', staff_role: 'teacher', can_teach: true, name: 'T', student_program: null };
const admin = { ...teacher, id: 'a1', user_type: 'admin', staff_role: 'admin' };

const req = (qs = '?classroom=c1', auth: string | null = 'Bearer x') =>
  new NextRequest(`http://localhost/api/students/s1/activity${qs}`, { headers: auth ? { Authorization: auth } : {} });
const ctx = { params: Promise.resolve({ id: 's1' }) };

beforeEach(() => {
  getRequestUser.mockReset();
  getUserTimeline.mockReset();
  for (const k of Object.keys(results)) delete results[k];
  vi.spyOn(console, 'error').mockImplementation(() => {});
  results.nexus_enrollments = { data: { user_id: 's1' }, error: null };
  getUserTimeline.mockResolvedValue({
    entries: [
      { occurred_at: '2026-09-25T10:00:00Z', kind: 'payment', title: 'Paid', detail: { amount: 5000 }, actor_id: null, source_app: null },
      { occurred_at: '2026-09-24T10:00:00Z', kind: 'note', title: 'Staff note', detail: { note: 'fee talk' }, actor_id: 'a1', actor_name: 'Hari', source_app: 'admin' },
      { occurred_at: '2026-09-23T10:00:00Z', kind: 'event', title: 'tool_completed', detail: {}, actor_id: null, source_app: 'app' },
    ],
    nextBefore: '2026-09-23T10:00:00Z',
  });
});

describe('GET /api/students/[id]/activity', () => {
  it('answers 401 for a rejected token', async () => {
    getRequestUser.mockRejectedValueOnce(new Error('Invalid Microsoft token: 401'));
    expect((await GET(req(), ctx)).status).toBe(401);
  });

  it('answers 400 without a classroom and 404 for a student not in it', async () => {
    getRequestUser.mockResolvedValue(teacher);
    expect((await GET(req(''), ctx)).status).toBe(400);
    results.nexus_enrollments = { data: null, error: null };
    expect((await GET(req(), ctx)).status).toBe(404);
    expect(getUserTimeline).not.toHaveBeenCalled();
  });

  it('gives a teacher no payment rows and no CRM notes', async () => {
    getRequestUser.mockResolvedValue(teacher);
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries.map((e: { kind: string }) => e.kind)).toEqual(['event']);
    expect(body.entries[0].title).toBe('Used a tool');
    expect(body.nextBefore).toBe('2026-09-23T10:00:00Z');
  });

  it('gives an admin the whole page', async () => {
    getRequestUser.mockResolvedValue(admin);
    const body = await (await GET(req('?classroom=c1&before=2026-09-30T00:00:00Z&limit=10'), ctx)).json();
    expect(body.entries).toHaveLength(3);
    expect(getUserTimeline).toHaveBeenCalledWith('s1', { before: '2026-09-30T00:00:00Z', limit: 10 });
  });

  it('answers 503 when the timeline read fails', async () => {
    getRequestUser.mockResolvedValue(admin);
    getUserTimeline.mockRejectedValueOnce({ code: 'PGRST202', message: 'function not found' });
    expect((await GET(req(), ctx)).status).toBe(503);
  });
});
