import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * getParentUser re-reads the credential row on every parent request, so that
 * Revoke is instant. It used to read only `data`, so a failed read (a dropped
 * connection, the client's deadline) looked exactly like a deleted row and told
 * the parent their access had been revoked (PERF-0014).
 */

const db = vi.hoisted(() => ({ result: { data: null as unknown, error: null as unknown } }));
vi.mock('@neram/database', () => ({
  getCurrentBatch: vi.fn(),
  getSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => db.result }),
      }),
    }),
  }),
}));

vi.mock('@/lib/ms-verify', () => ({
  verifyMsToken: async () => ({ oid: 'parent:uuid-1', email: '', name: 'P', displayName: 'P', parentUserId: 'parent-1' }),
}));

import { getParentUser } from './parent-auth';
import { httpStatusForError } from './api-errors';

const activeRow = {
  login_id: 'P-1001',
  must_change_password: false,
  token_version: 1,
  is_active: true,
  parent: { id: 'parent-1', name: 'A Parent', email: null, phone: null },
};

async function statusOf(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
  } catch (err) {
    return httpStatusForError(err);
  }
  throw new Error('expected getParentUser to throw');
}

afterEach(() => {
  db.result = { data: null, error: null };
  vi.restoreAllMocks();
});

describe('getParentUser', () => {
  it('answers a failed credential read as 503, not as revoked access', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.result = { data: null, error: { message: 'TypeError: fetch failed', code: '' } };

    await expect(getParentUser('Bearer par_x')).rejects.not.toThrow(/revoked/i);
    expect(await statusOf(getParentUser('Bearer par_x'))).toBe(503);
  });

  it('still answers revoked access as 401', async () => {
    db.result = { data: { ...activeRow, is_active: false }, error: null };
    expect(await statusOf(getParentUser('Bearer par_x'))).toBe(401);
  });

  it('returns the parent when the row is active', async () => {
    db.result = { data: activeRow, error: null };
    await expect(getParentUser('Bearer par_x')).resolves.toMatchObject({ id: 'parent-1', loginId: 'P-1001' });
  });
});
