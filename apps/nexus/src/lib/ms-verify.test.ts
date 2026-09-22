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

// What the next row read answers. `row` is what the query returns when it works;
// `error` stands in for a PostgREST failure (a dropped connection, a deadline).
const db = vi.hoisted(() => ({ row: null as unknown, error: null as unknown }));
const answer = async () => (db.error ? { data: null, error: db.error } : { data: db.row ?? parentCredential, error: null });
vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: answer,
          single: answer,
        }),
      }),
    }),
  }),
}));

vi.mock('./parent-token', () => ({
  isParentToken: (t: string) => t.startsWith('par_'),
  verifyParentToken: () => ({ parentUserId: 'parent-1', parentMsOid: 'parent:uuid-1', sid: 'sid-1' }),
}));

const imp = vi.hoisted(() => ({ payload: null as unknown }));
vi.mock('./impersonation-token', () => ({
  isImpersonationToken: (t: string) => t.startsWith('imp_'),
  verifyImpersonationToken: () => imp.payload,
}));

// Token validation itself is covered in teams-sso.test.ts; here only the branch.
const teamsSso = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock('./teams-sso', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./teams-sso')>()),
  isTeamsSsoToken: (t: string) => t.startsWith('sso.'),
  verifyTeamsSsoToken: (t: string) => teamsSso.verify(t),
}));

import { verifyMsToken, __clearGraphIdentityCache } from './ms-verify';
import { httpStatusForError } from './api-errors';
import { TeamsSsoError } from './teams-sso';

/** The HTTP status a route would answer with for whatever verifyMsToken threw. */
async function statusOf(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
  } catch (err) {
    return httpStatusForError(err);
  }
  throw new Error('expected verifyMsToken to throw');
}

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
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'upstream' })
      .mockResolvedValueOnce({ ok: true, json: async () => GRAPH_PROFILE });
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    await expect(verifyMsToken('Bearer real-token')).rejects.toThrow(/unavailable/i);

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

  /** A JWT-shaped token that expires `inSeconds` from now (the signature is never checked here). */
  const tokenExpiringIn = (inSeconds: number) => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + inSeconds;
    return `Bearer ${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ exp, oid: 'oid-abc' })}.sig`;
  };

  it('keeps a verified identity for 5 minutes, so the 60s pollers stop calling Graph every time', async () => {
    // Both shell pollers run every 60s; a 60s cache was cold on almost every poll,
    // so each one paid a Graph round trip from sin1, the call that could stall.
    const fetchSpy = mockGraphOk();
    vi.stubGlobal('fetch', fetchSpy);
    const token = tokenExpiringIn(3600);

    await verifyMsToken(token);
    vi.advanceTimersByTime(4 * 60_000);
    await verifyMsToken(token);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60_000);
    await verifyMsToken(token);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('never keeps an identity past the token\'s own expiry', async () => {
    const fetchSpy = mockGraphOk();
    vi.stubGlobal('fetch', fetchSpy);
    const token = tokenExpiringIn(90);

    await verifyMsToken(token);
    vi.advanceTimersByTime(90_000);
    await verifyMsToken(token);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('gives up on a Graph call that never answers instead of holding the request open', async () => {
    // Production showed /api/notifications and /api/nav-badges answering 524: the
    // function sent nothing for Cloudflare's 100s. Every route verifies through this
    // Graph call first, and it had no deadline, so one stalled call held the request
    // open for as long as the platform allowed.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchSpy = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    const settled = expect(verifyMsToken('Bearer stalled-token')).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(8_000);
    await settled;

    // A timeout is a failure, and failures are never cached.
    vi.stubGlobal('fetch', mockGraphOk());
    await expect(verifyMsToken('Bearer stalled-token')).resolves.toMatchObject({ oid: expect.any(String) });
  });

  it('never leaks the raw Graph error body into the thrown message', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () =>
        '{"error":{"code":"InvalidAuthenticationToken","message":"Lifetime validation failed, the token is expired."}}',
    });
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    let caught: Error | null = null;
    try {
      await verifyMsToken('Bearer dead-token');
    } catch (err) {
      caught = err as Error;
    }

    expect(caught).not.toBeNull();
    expect(caught!.message).toMatch(/^Invalid Microsoft token: 401$/);
    expect(caught!.message).not.toContain('InvalidAuthenticationToken');
    expect(caught!.message).not.toContain('Lifetime validation');
    // The raw body is still logged server-side, just not returned to a caller.
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('InvalidAuthenticationToken'));

    consoleSpy.mockRestore();
  });
});

/**
 * An outage is not a sign-out (PERF-0013, PERF-0014).
 *
 * Everything below used to throw a message api-errors.ts classifies as 401, and a
 * 401 is what makes useAuthFetch start a Microsoft sign-in redirect and what drops
 * a teacher out of View as Student. So Graph throttling, a Graph 5xx, or one failed
 * database read signed people out of Nexus in the middle of their work. Those now
 * answer 503, which the client treats as "could not reach Nexus, try again".
 */
describe('verifyMsToken: outages answer 503, refusals stay 401', () => {
  beforeEach(() => {
    __clearGraphIdentityCache();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    db.row = null;
    db.error = null;
    imp.payload = null;
    teamsSso.verify.mockReset();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const graphAnswers = (status: number) =>
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status, text: async () => 'x' })) as unknown as typeof fetch);

  it.each([429, 500, 502, 503, 504])('answers a Graph %i as 503, not as a bad token', async (status) => {
    graphAnswers(status);
    await expect(verifyMsToken('Bearer good-token')).rejects.not.toThrow(/Invalid Microsoft token/);
    expect(await statusOf(verifyMsToken('Bearer good-token'))).toBe(503);
  });

  it.each([401, 403])('still answers a Graph %i as an invalid token (401)', async (status) => {
    graphAnswers(status);
    await expect(verifyMsToken('Bearer dead-token')).rejects.toThrow(`Invalid Microsoft token: ${status}`);
    expect(await statusOf(verifyMsToken('Bearer dead-token'))).toBe(401);
  });

  it('answers a Graph call that cannot connect as 503', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    expect(await statusOf(verifyMsToken('Bearer good-token'))).toBe(503);
  });

  it('answers a Graph call that times out as 503', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      ) as unknown as typeof fetch,
    );
    const status = statusOf(verifyMsToken('Bearer stalled-token'));
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await status).toBe(503);
  });

  it("answers a Teams token as 503 when Microsoft's signing keys cannot be fetched", async () => {
    teamsSso.verify.mockRejectedValue(new Error('Signing keys unavailable: 503'));
    expect(await statusOf(verifyMsToken('Bearer sso.token'))).toBe(503);
  });

  it('still answers a Teams token that fails its checks as 401', async () => {
    teamsSso.verify.mockRejectedValue(new TeamsSsoError('Token expired'));
    expect(await statusOf(verifyMsToken('Bearer sso.token'))).toBe(401);
  });

  it('does not tell a parent their access was revoked when the database read fails', async () => {
    db.error = { message: 'TypeError: fetch failed', code: '' };
    await expect(verifyMsToken('Bearer par_x', { allowParent: true })).rejects.not.toThrow(/revoked/i);
    expect(await statusOf(verifyMsToken('Bearer par_x', { allowParent: true }))).toBe(503);
  });

  it('still tells a parent whose access really was revoked (401)', async () => {
    db.row = { ...parentCredential, is_active: false };
    expect(await statusOf(verifyMsToken('Bearer par_x', { allowParent: true }))).toBe(401);
  });

  describe('View as Student', () => {
    const student = { id: 'stu-1', name: 'A Student', email: 's@neramclasses.com', linked_classroom_email: null, ms_oid: 'oid-stu' };

    beforeEach(() => {
      imp.payload = { targetUserId: 'stu-1', targetMsOid: 'oid-stu', impersonatorUserId: 'teacher-1' };
    });

    it('does not end the session when the student lookup fails', async () => {
      db.error = { message: 'TypeError: fetch failed', code: '' };
      await expect(verifyMsToken('Bearer imp_x')).rejects.not.toThrow(/no longer valid/);
      expect(await statusOf(verifyMsToken('Bearer imp_x'))).toBe(503);
    });

    it('still ends it when the student is gone (no row, PGRST116)', async () => {
      db.error = { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' };
      expect(await statusOf(verifyMsToken('Bearer imp_x'))).toBe(401);
    });

    it('resolves as the student when the lookup works', async () => {
      db.row = student;
      await expect(verifyMsToken('Bearer imp_x')).resolves.toMatchObject({ oid: 'oid-stu', impersonatorUserId: 'teacher-1' });
    });
  });
});

describe('verifyMsToken Teams SSO branch', () => {
  const identity = { oid: 'teams-oid', tid: 'tenant-1', email: 'student@neramclasses.com', name: 'A Student' };

  afterEach(() => {
    teamsSso.verify.mockReset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resolves a Teams SSO token locally, without calling Graph', async () => {
    const fetchSpy = mockGraphOk();
    vi.stubGlobal('fetch', fetchSpy);
    teamsSso.verify.mockResolvedValue(identity);

    await expect(verifyMsToken('Bearer sso.token')).resolves.toEqual({
      oid: 'teams-oid',
      email: 'student@neramclasses.com',
      name: 'A Student',
      displayName: 'A Student',
    });
    expect(teamsSso.verify).toHaveBeenCalledWith('sso.token');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('answers a rejected Teams SSO token as an invalid Microsoft token and never falls back to Graph', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchSpy = mockGraphOk();
    vi.stubGlobal('fetch', fetchSpy);
    teamsSso.verify.mockRejectedValue(new TeamsSsoError('Token audience mismatch'));

    await expect(verifyMsToken('Bearer sso.forged')).rejects.toThrow(/^Invalid Microsoft token: 401$/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Token audience mismatch'));
  });

  it('verifies a Teams SSO token on every request instead of caching the identity', async () => {
    vi.stubGlobal('fetch', mockGraphOk());
    teamsSso.verify.mockResolvedValue(identity);

    await verifyMsToken('Bearer sso.token');
    await verifyMsToken('Bearer sso.token');
    expect(teamsSso.verify).toHaveBeenCalledTimes(2);
  });

  it('still sends every other token to Graph', async () => {
    const fetchSpy = mockGraphOk();
    vi.stubGlobal('fetch', fetchSpy);

    await verifyMsToken('Bearer graph-token');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(teamsSso.verify).not.toHaveBeenCalled();
  });
});
