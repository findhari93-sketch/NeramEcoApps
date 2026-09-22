import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * getRequestUser must tell a missing user apart from a lookup that failed.
 *
 * `.single()` reports a failure (a statement timeout, the Supabase proxy dropping
 * the connection) through `error` and leaves `data` null. Reading only `data`
 * turned every such failure into "User not found", which httpStatusForError
 * maps to 401: a database hiccup told the client its session had ended, and
 * /api/nav-badges answered 404. Only PGRST116 (no row) means "not found".
 */

const single = vi.fn();
let oidCounter = 0;

vi.mock('@/lib/ms-verify', () => ({
  // A fresh oid per call: getRequestUser caches rows by oid for 30s.
  verifyMsToken: vi.fn(async () => ({ oid: `oid-${++oidCounter}`, email: 'x@example.com', name: 'X', displayName: 'X' })),
}));

vi.mock('@neram/database', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getSupabaseAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
  }),
}));

import { getRequestUser } from './study-materials';
import { httpStatusForError } from './api-errors';

beforeEach(() => {
  single.mockReset();
});

describe('getRequestUser lookup failures', () => {
  it('reports a failed lookup as a server failure, not a missing user', async () => {
    single.mockResolvedValueOnce({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } });
    const err = await getRequestUser('Bearer t').catch((e) => e);
    expect(err.message).toMatch(/Could not load the signed-in user/);
    expect(httpStatusForError(err)).toBe(500);
  });

  it('still reports a genuinely missing row as User not found (401)', async () => {
    single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } });
    const err = await getRequestUser('Bearer t').catch((e) => e);
    expect(err.message).toBe('User not found');
    expect(httpStatusForError(err)).toBe(401);
  });

  it('returns the row when the lookup succeeds', async () => {
    single.mockResolvedValueOnce({ data: { id: 'u1', user_type: 'teacher' }, error: null });
    await expect(getRequestUser('Bearer t')).resolves.toMatchObject({ id: 'u1' });
  });
});
