import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * /api/auth/me is the one request every Nexus page boots from, so its status code
 * decides what the client does next: a 401 means "signed out" (RoleGuard sends the
 * user to sign in), a 200 is cached on the device as the next boot's shell.
 *
 * It used to answer 401 for every thrown error and to read a failed query as an
 * empty result. A Graph timeout or a database deadline therefore signed people
 * out, a failed users read sent an existing account down the first-login
 * reconciler, and a failed enrolments read answered 200 with no classrooms, which
 * showed an enrolled student the "not in a classroom" screen and cached it (PERF-0012).
 */

const verifyMsToken = vi.fn();
const reconcileMsIdentity = vi.fn();
const results: Record<string, unknown> = {};
const writes: Array<{ table: string; patch: Record<string, unknown> }> = [];

/** A chainable stand-in for the PostgREST builder; each table answers from `results`. */
function table(name: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'insert', 'or']) b[m] = () => b;
  b.update = (patch: Record<string, unknown>) => { writes.push({ table: name, patch }); return b; };
  b.maybeSingle = async () => results[`${name}.row`] ?? { data: null, error: null };
  b.single = b.maybeSingle;
  b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
    Promise.resolve(results[`${name}.list`] ?? { data: [], error: null }).then(ok, bad);
  return b;
}

vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: (...a: unknown[]) => verifyMsToken(...a) }));
vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: (name: string) => table(name) }),
  reconcileMsIdentity: (...a: unknown[]) => reconcileMsIdentity(...a),
  getNexusSetting: vi.fn(async () => null),
  getCurrentBatch: vi.fn(async () => ({ code: '2026-27' })),
}));
vi.mock('@neram/auth', () => ({ getUserProfile: vi.fn(async () => null) }));
vi.mock('@/lib/parent-auth', () => ({ listParentChildren: vi.fn(async () => []), getChildClassrooms: vi.fn(async () => new Map()) }));
vi.mock('@/lib/not-started-server', () => ({ recordNexusEntry: vi.fn(async () => {}) }));

import { getNexusSetting } from '@neram/database';
import { GET } from './route';

const request = (extra: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/auth/me', { headers: { Authorization: 'Bearer t', ...extra } });

const student = {
  id: 'u1',
  name: 'Asha',
  email: 'asha@neramclasses.com',
  user_type: 'student',
  staff_role: null,
  can_teach: true,
  is_alumni: false,
  nexus_first_login_at: '2026-09-01T00:00:00Z',
  nexus_last_login_at: new Date().toISOString(),
  nexus_entered_at: '2026-09-01T00:00:00Z',
  photo_status: 'approved',
};
const classroom = { id: 'c1', name: 'NATA 2027', is_active: true, is_archived: false, academic_year: '2026-27' };

beforeEach(() => {
  verifyMsToken.mockReset();
  reconcileMsIdentity.mockReset();
  for (const k of Object.keys(results)) delete results[k];
  writes.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/auth/me status codes', () => {
  it('answers 401 when the token is rejected', async () => {
    verifyMsToken.mockRejectedValueOnce(new Error('Invalid Microsoft token: 401'));
    expect((await GET(request())).status).toBe(401);
  });

  it('answers 500, not 401, when the identity check fails for a reason other than the token', async () => {
    verifyMsToken.mockRejectedValueOnce(new Error('Microsoft identity check timed out'));
    expect((await GET(request())).status).toBe(500);
  });

  it('answers 500 when the users read fails, and never treats it as a first login', async () => {
    verifyMsToken.mockResolvedValueOnce({ oid: 'o1', email: student.email, name: student.name });
    results['users.row'] = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
    expect((await GET(request())).status).toBe(500);
    expect(reconcileMsIdentity).not.toHaveBeenCalled();
  });

  it('answers 500 when the enrolments read fails, instead of a 200 with no classrooms', async () => {
    verifyMsToken.mockResolvedValueOnce({ oid: 'o1', email: student.email, name: student.name });
    results['users.row'] = { data: student, error: null };
    results['nexus_enrollments.list'] = { data: null, error: { code: '', message: 'TypeError: fetch failed' } };
    expect((await GET(request())).status).toBe(500);
  });

  it('returns the classrooms when every read succeeds', async () => {
    verifyMsToken.mockResolvedValueOnce({ oid: 'o1', email: student.email, name: student.name });
    results['users.row'] = { data: student, error: null };
    results['nexus_enrollments.list'] = { data: [{ role: 'student', classroom }], error: null };
    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nexusRole).toBe('student');
    expect(body.classrooms.map((c: { id: string }) => c.id)).toEqual(['c1']);
  });

  it('names the Microsoft account it answered for, so the device cache is kept per account', async () => {
    // useNexusAuth keys the device caches on data.user.ms_oid. Without it every
    // account on a device shared one bucket (PERF-0025).
    verifyMsToken.mockResolvedValueOnce({ oid: 'o1', email: student.email, name: student.name });
    results['users.row'] = { data: student, error: null };
    results['nexus_enrollments.list'] = { data: [{ role: 'student', classroom }], error: null };
    const body = await (await GET(request())).json();
    expect(body.user.ms_oid).toBe('o1');
  });
});

describe('GET /api/auth/me device time zone (NXS-0129)', () => {
  const signIn = () => {
    verifyMsToken.mockResolvedValueOnce({ oid: 'o1', email: student.email, name: student.name });
    results['users.row'] = { data: student, error: null };
    results['nexus_enrollments.list'] = { data: [{ role: 'student', classroom }], error: null };
  };
  const zoneWrites = () => writes.filter((w) => w.table === 'users' && 'timezone' in w.patch);

  it("saves a student's device time zone in its own write", async () => {
    signIn();
    const res = await GET(request({ 'X-Time-Zone': 'Asia/Dubai' }));
    expect(res.status).toBe(200);
    expect(zoneWrites()).toEqual([{ table: 'users', patch: { timezone: 'Asia/Dubai' } }]);
    // Never folded into the login stamp, so a missing column cannot cost the stamp.
    expect(writes.find((w) => 'last_login_at' in w.patch)?.patch).not.toHaveProperty('timezone');
  });

  it('ignores a zone that is not a real one', async () => {
    signIn();
    await GET(request({ 'X-Time-Zone': 'Not/AZone' }));
    expect(zoneWrites()).toEqual([]);
  });

  it('writes nothing without the header', async () => {
    signIn();
    await GET(request());
    expect(zoneWrites()).toEqual([]);
  });
});

describe('GET /api/auth/me assistant pilot (Ruling 22)', () => {
  const signIn = () => {
    verifyMsToken.mockResolvedValueOnce({ oid: 'o1', email: student.email, name: student.name });
    results['users.row'] = { data: student, error: null };
    results['nexus_enrollments.list'] = { data: [{ role: 'student', classroom }], error: null };
  };
  const settings = (pilot: unknown) =>
    vi.mocked(getNexusSetting).mockImplementation(async (key: string) => {
      if (key === 'feature_flags') return { value: { 'student.assistant-chat': true } } as never;
      if (key === 'assistant_pilot_user_ids') return { value: pilot } as never;
      return null as never;
    });
  const assistantFlag = async () => ((await (await GET(request())).json()).featureFlags['student.assistant-chat']);

  it('reads false for a student outside a non-empty pilot list', async () => {
    settings(['someone-else']);
    signIn();
    expect(await assistantFlag()).toBe(false);
  });

  it('reads true for a listed student', async () => {
    settings(['u1']);
    signIn();
    expect(await assistantFlag()).toBe(true);
  });

  it('reads true for everyone when the list is empty', async () => {
    settings([]);
    signIn();
    expect(await assistantFlag()).toBe(true);
  });
});
