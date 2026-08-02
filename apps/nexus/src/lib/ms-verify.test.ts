import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The parent branch reads a credential row, so the admin client has to exist even
// though the cached path never reaches it.
const parentCredential = {
  parent_user_id: 'parent-1',
  token_version: 'sid-1',
  is_active: true,
  parent: {
    id: 'parent-1',
    name: 'A Parent',
    email: 'parent@example.com',
    ms_oid: 'parent:uuid-1',
    user_type: 'parent',
  },
};

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: parentCredential }),
          single: async () => ({ data: parentCredential }),
        }),
      }),
    }),
  }),
}));

vi.mock('./parent-token', () => ({
  isParentToken: (t: string) => t.startsWith('par_'),
  verifyParentToken: () => ({ parentUserId: 'parent-1', parentMsOid: 'parent:uuid-1', sid: 'sid-1' }),
}));

vi.mock('./impersonation-token', () => ({
  isImpersonationToken: (t: string) => t.startsWith('imp_'),
  verifyImpersonationToken: () => null,
}));

import { verifyMsToken, __clearGraphIdentityCache } from './ms-verify';

const GRAPH_PROFILE = {
  id: 'oid-abc',
  userPrincipalName: 'teacher@neramclasses.com',
  displayName: 'A Teacher',
};

function mockGraphOk() {
  return vi.fn(async () => ({
    ok: true,
    json: async () => GRAPH_PROFILE,
  })) as unknown as typeof fetch;
}

describe('verifyMsToken identity cache', () => {
  beforeEach(() => {
    __clearGraphIdentityCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('calls Graph once and serves repeat requests from cache', async () => {
    const fetchSpy = mockGraphOk();
    vi.stubGlobal('fetch', fetchSpy);

    const first = await verifyMsToken('Bearer real-token');
    const second = await verifyMsToken('Bearer real-token');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first.oid).toBe('oid-abc');
    expect(first.email).toBe('teacher@neramclasses.com');
  });

  it('asks Graph again once the ttl has elapsed', async () => {
    const fetchSpy = mockGraphOk();
    vi.stubGlobal('fetch', fetchSpy);

    await verifyMsToken('Bearer real-token');
    vi.advanceTimersByTime(60_000);
    await verifyMsToken('Bearer real-token');

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('keeps different tokens apart', async () => {
    const fetchSpy = mockGraphOk();
    vi.stubGlobal('fetch', fetchSpy);

    await verifyMsToken('Bearer token-one');
    await verifyMsToken('Bearer token-two');

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('never caches a rejection, so a transient Graph failure does not strand a user', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'upstream' })
      .mockResolvedValueOnce({ ok: true, json: async () => GRAPH_PROFILE });
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    await expect(verifyMsToken('Bearer real-token')).rejects.toThrow(/Invalid Microsoft token/);

    const recovered = await verifyMsToken('Bearer real-token');

    expect(recovered.oid).toBe('oid-abc');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('does not cache the parent branch, so Revoke stays immediate', async () => {
    const fetchSpy = mockGraphOk();
    vi.stubGlobal('fetch', fetchSpy);

    const first = await verifyMsToken('Bearer par_x', { allowParent: true });
    expect(first.parentUserId).toBe('parent-1');

    // Access is pulled between the two calls.
    parentCredential.is_active = false;

    await expect(verifyMsToken('Bearer par_x', { allowParent: true })).rejects.toThrow(
      /revoked/i,
    );

    parentCredential.is_active = true;
    // The parent path must never have touched Graph.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still refuses a parent token on a route that did not opt in', async () => {
    vi.stubGlobal('fetch', mockGraphOk());

    await expect(verifyMsToken('Bearer par_x')).rejects.toThrow(/Parent accounts cannot/);
  });

  it('rejects a missing Authorization header before any cache lookup', async () => {
    const fetchSpy = mockGraphOk();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(verifyMsToken(null)).rejects.toThrow(/Missing or invalid/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
