import { describe, it, expect, vi, beforeEach } from 'vitest';

const merge = vi.fn();
const disposable = vi.fn();
vi.mock('@neram/database', async () => {
  const actual = await vi.importActual<any>('@neram/database');
  return { ...actual, mergeUserRecords: (...a: unknown[]) => merge(...a), isDisposableAccount: (...a: unknown[]) => disposable(...a) };
});

import { resolveEnrolUser, wrongAccountMessage } from './enrol-user';

const copy = (row: any) => (row ? { ...row } : null);

/** Just enough of supabase-js for these routes: select/eq/single, update/eq, insert. */
function fakeDb(rows: Record<string, any[]>) {
  const writes: { table: string; op: 'update' | 'insert'; data: any; filters?: Record<string, unknown> }[] = [];
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let patch: any = null;
    const find = () => (rows[table] || []).find((r) => Object.entries(filters).every(([k, v]) => r[k] === v)) ?? null;
    const api: any = {
      select: () => api,
      eq: (col: string, val: unknown) => ((filters[col] = val), api),
      update: (p: any) => ((patch = p), api),
      insert: (row: any) => (writes.push({ table, op: 'insert', data: row }), Promise.resolve({ error: null })),
      maybeSingle: () => Promise.resolve({ data: copy(find()), error: null }),
      single: () => Promise.resolve({ data: copy(find()), error: null }),
      then: (ok: any, fail: any) => {
        if (patch) {
          writes.push({ table, op: 'update', data: patch, filters: { ...filters } });
          const row = find();
          if (row) Object.assign(row, patch);
        }
        return Promise.resolve({ error: null }).then(ok, fail);
      },
    };
    return api;
  };
  return { db: { from }, writes };
}

const DEMO = 'demo-1';
const LINK = { id: 'link-1', user_id: 'acct', student_phone: '+916508347929', demo_registration_id: DEMO };

function world() {
  return fakeDb({
    users: [
      { id: 'acct', user_type: 'lead', phone: '+919500732502', phone_verified: true },
      { id: 'shell', user_type: 'lead', phone: '+966508347929', created_at: new Date().toISOString() },
    ],
    demo_class_registrations: [{ id: DEMO, phone: '6508347929' }],
    direct_enrollment_links: [{ ...LINK }],
  });
}

beforeEach(() => {
  merge.mockReset();
  disposable.mockReset();
});

describe('resolveEnrolUser: the student changes their own number', () => {
  it('folds a fresh sign-in on a NEW number into the link account and moves every record to it', async () => {
    disposable.mockResolvedValue(true);
    const { db, writes } = world();
    const who = await resolveEnrolUser(db, { ...LINK }, { userId: 'shell', phone: '+966508347929', phoneVerified: true });

    expect(who).toEqual({ userId: 'acct' });
    expect(merge).toHaveBeenCalledWith('acct', 'shell', null, db);
    expect(writes).toContainEqual({ table: 'users', op: 'update', data: { phone: '+966508347929', phone_verified: true }, filters: { id: 'acct' } });
    expect(writes).toContainEqual({
      table: 'user_profile_history',
      op: 'insert',
      data: { user_id: 'acct', field_name: 'phone', old_value: '"+919500732502"', new_value: '"+966508347929"', change_source: 'user' },
    });
    expect(writes).toContainEqual({ table: 'direct_enrollment_links', op: 'update', data: { student_phone: '+966508347929' }, filters: { id: 'link-1' } });
    expect(writes).toContainEqual({ table: 'demo_class_registrations', op: 'update', data: { phone: '+966508347929' }, filters: { id: DEMO } });
    const note = writes.find((w) => w.table === 'demo_request_events');
    expect(note?.data).toMatchObject({ registration_id: DEMO, kind: 'note', outcome: 'phone_changed', actor_id: null });
    expect(note?.data.note).toContain('from +916508347929 to +966508347929');
  });

  it('refuses an established account and names the number we have, masked', async () => {
    disposable.mockResolvedValue(false);
    const { db, writes } = world();

    const who: any = await resolveEnrolUser(db, { ...LINK }, { userId: 'shell', phone: '+966508347929', phoneVerified: true });

    expect(who.response.status).toBe(409);
    const body = await who.response.json();
    expect(body.code).toBe('WRONG_ACCOUNT');
    expect(body.error).toContain('+91 ******502');
    expect(merge).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('writes nothing when the student signs in on the number already on file', async () => {
    const { db, writes } = fakeDb({
      users: [{ id: 'acct', phone: '+919500732502' }],
      demo_class_registrations: [{ id: DEMO, phone: '9500732502' }],
    });
    const link = { ...LINK, student_phone: '+919500732502' };
    const who = await resolveEnrolUser(db, link, { userId: 'acct', phone: '+919500732502', phoneVerified: true });
    expect(who).toEqual({ userId: 'acct' });
    expect(writes).toEqual([]);
  });

  it('never moves records for a sign-in that has not proved a number', async () => {
    const { db, writes } = world();
    const who = await resolveEnrolUser(db, { ...LINK }, { userId: 'acct', phone: '+966508347929', phoneVerified: false });
    expect(who).toEqual({ userId: 'acct' });
    expect(writes).toEqual([]);
  });
});

describe('wrongAccountMessage', () => {
  it('asks for an OTP when no number was proved', () => {
    expect(wrongAccountMessage('+919500732502', false)).toBe('Verify your mobile number with an OTP to continue.');
  });

  it('offers a different number when we have none on file', () => {
    expect(wrongAccountMessage(null, true)).toContain('Sign in with a different number of your own');
  });
});
