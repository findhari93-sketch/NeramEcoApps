import { describe, it, expect, vi, beforeEach } from 'vitest';

const provision = vi.fn();
vi.mock('@neram/auth/student-accounts', async () => {
  const actual = await vi.importActual<any>('@neram/auth/student-accounts');
  return { ...actual, provisionClassAccount: (...a: unknown[]) => provision(...a) };
});
const student = { id: 'u1', firstName: 'Hansa', lastName: 'Shajahan', fatherName: 'Shajahan', isStaff: false, isStudent: true };
vi.mock('./class-account-store', () => ({
  createClassAccountPorts: () => ({
    store: { getStudent: async () => student, readDefaults: async () => ({ domain: 'neramclasses.com' }) },
  }),
}));

import { autoProvisionClassAccount, claimRun, finishClassAccount, loginIdsToTry, RUN_LEASE_MS } from './class-account-auto';

/** users / class_account_setups / links, with the insert and lease update the claim makes. */
function fakeDb(opts: { user?: any; setup?: any; insertError?: any; leased?: boolean }) {
  const calls: string[] = [];
  const from = (table: string) => {
    const api: any = {
      select: () => api,
      eq: () => api,
      or: () => api,
      lt: () => api,
      order: () => api,
      limit: async () => ({ data: [{ created_by: 'staff-1', verified_by: null }] }),
      maybeSingle: async () => ({ data: table === 'users' ? opts.user : opts.setup ?? null }),
      insert: async () => (calls.push(`insert ${table}`), { error: opts.insertError ?? null }),
      update: () => {
        calls.push(`lease ${table}`);
        return { eq: () => ({ lt: () => ({ select: async () => ({ data: opts.leased ? [{}] : [], error: null }) }) }) };
      },
    };
    return api;
  };
  return { db: { from }, calls };
}

beforeEach(() => provision.mockReset());

describe('loginIdsToTry', () => {
  it('starts with the suggested ID, then numbers it', () => {
    expect(loginIdsToTry('Hansa_Shajahan', 3)).toEqual(['Hansa_Shajahan', 'Hansa_Shajahan2', 'Hansa_Shajahan3']);
  });
});

describe('claimRun', () => {
  it('the first run owns the new setup row', async () => {
    const { db } = fakeDb({});
    expect(await claimRun(db, 'u1', 'x@neramclasses.com', null, Date.now())).toBe(true);
  });

  it('a second run waits while the first is live, and takes over a stopped one', async () => {
    expect(await claimRun(fakeDb({ insertError: { code: '23505' }, leased: false }).db, 'u1', 'x', null, Date.now())).toBe(false);
    expect(await claimRun(fakeDb({ insertError: { code: '23505' }, leased: true }).db, 'u1', 'x', null, Date.now() + RUN_LEASE_MS)).toBe(true);
  });
});

describe('autoProvisionClassAccount', () => {
  it('makes the account for an enrolled student, trying the next login ID when one is taken', async () => {
    provision
      .mockResolvedValueOnce({ kind: 'conflict', status: 409, code: 'upn_taken', error: 'taken' })
      .mockResolvedValueOnce({ kind: 'ok', setup: { upn: 'Hansa_Shajahan2@neramclasses.com' }, password: null, complete: false });
    const { db } = fakeDb({ user: { id: 'u1', user_type: 'student', ms_oid: null } });

    const result = await autoProvisionClassAccount(db, 'u1');

    expect(result).toEqual({ status: 'ready', upn: 'Hansa_Shajahan2@neramclasses.com' });
    expect(provision.mock.calls.map((c) => c[1].username)).toEqual(['Hansa_Shajahan', 'Hansa_Shajahan2']);
    expect(provision.mock.calls[0][1].actorId).toBe('staff-1');
  });

  it('does nothing for a finished account, a hand-made one, or someone still running', async () => {
    expect(await autoProvisionClassAccount(fakeDb({ user: { id: 'u1', user_type: 'student' }, setup: { upn: 'a@x', steps: { account: { status: 'done' } } } }).db, 'u1')).toEqual({ status: 'ready', upn: 'a@x' });
    expect(await autoProvisionClassAccount(fakeDb({ user: { id: 'u1', user_type: 'student', ms_oid: 'oid' } }).db, 'u1')).toEqual({ status: 'has_account' });
    expect(await autoProvisionClassAccount(fakeDb({ user: { id: 'u1', user_type: 'student', ms_oid: null }, insertError: { code: '23505' }, leased: false }).db, 'u1')).toEqual({ status: 'working' });
    expect(provision).not.toHaveBeenCalled();
  });
});

describe('finishClassAccount', () => {
  const made = { created_by: 'staff-1', steps: { account: { status: 'done' }, teams: { status: 'failed' } } };
  const steps = (teams: string) =>
    Object.fromEntries(['account', 'licence', 'link', 'classroom', 'teams', 'welcome'].map((k) => [k, { status: k === 'teams' ? teams : 'done' }]));

  it('redoes the failed steps as the staff member who made the account', async () => {
    provision.mockResolvedValue({ kind: 'ok', setup: { upn: 'Radhika_Bhanuprakash@neramclasses.com', steps: steps('done') } });
    const { db } = fakeDb({ setup: made, leased: true });
    expect(await finishClassAccount(db, 'u1')).toEqual({ status: 'ready', upn: 'Radhika_Bhanuprakash@neramclasses.com' });
    expect(provision).toHaveBeenCalledWith(expect.anything(), { userId: 'u1', actorId: 'staff-1' });
  });

  it('says which step still fails', async () => {
    provision.mockResolvedValue({ kind: 'ok', setup: { upn: 'x', steps: steps('failed') } });
    expect(await finishClassAccount(fakeDb({ setup: made, leased: true }).db, 'u1')).toEqual({ status: 'failed', message: 'Still failing: teams' });
  });

  it('leaves it while another run holds it, and never makes an account', async () => {
    expect(await finishClassAccount(fakeDb({ setup: made, leased: false }).db, 'u1')).toEqual({ status: 'working' });
    expect(await finishClassAccount(fakeDb({ setup: { steps: { account: { status: 'failed' } } } }).db, 'u1')).toEqual({ status: 'not_enrolled' });
    expect(provision).not.toHaveBeenCalled();
  });
});
