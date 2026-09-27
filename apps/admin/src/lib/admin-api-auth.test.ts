// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  AdminCallerCache,
  exactIlikePattern,
  isExemptApiPath,
  resolveAdminCaller,
  type AdminAuthDeps,
} from './admin-api-auth';

type Row = { id: string; user_type: string | null; email: string | null; ms_oid: string | null };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/**
 * Fake network: Graph /me answers from `graph`, PostgREST answers by filter.
 * Records every URL so a test can assert what was (not) called.
 */
function makeDeps(opts: {
  graph?: { status: number; body?: unknown } | 'throw';
  byOid?: Row[] | 'error';
  byEmail?: Row[] | 'error';
  allowTestTokens?: boolean;
  cache?: AdminCallerCache;
}) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith('https://graph.microsoft.com')) {
      if (opts.graph === 'throw') throw new Error('network');
      const g = opts.graph ?? { status: 200, body: { id: 'oid-1', userPrincipalName: 'Staff@neramclasses.com' } };
      return json(g.body ?? {}, g.status);
    }
    if (url.includes('ms_oid=eq.')) {
      if (opts.byOid === 'error') return json({ message: 'boom' }, 500);
      return json(opts.byOid ?? []);
    }
    if (url.includes('email=ilike.')) {
      if (opts.byEmail === 'error') return json({ message: 'boom' }, 500);
      return json(opts.byEmail ?? []);
    }
    return json({}, 404);
  });
  const deps: AdminAuthDeps = {
    fetch: fetchImpl as unknown as typeof fetch,
    supabaseUrl: 'https://db.example.com/',
    serviceKey: 'service-key',
    allowTestTokens: opts.allowTestTokens ?? false,
    now: () => 1_000,
    cache: opts.cache,
  };
  return { deps, calls, fetchImpl };
}

const admin: Row = { id: 'u-admin', user_type: 'admin', email: 'staff@neramclasses.com', ms_oid: 'oid-1' };

describe('isExemptApiPath', () => {
  it('exempts only the self-verifying and cron routes', () => {
    expect(isExemptApiPath('/api/auth/me')).toBe(true);
    expect(isExemptApiPath('/api/cron/auto-first-touch')).toBe(true);
    expect(isExemptApiPath('/api/crm/users')).toBe(false);
    expect(isExemptApiPath('/api/auth/me/extra')).toBe(false);
    expect(isExemptApiPath('/api/cronjobs')).toBe(false);
  });
});

describe('exactIlikePattern', () => {
  it('escapes LIKE metacharacters common in real addresses', () => {
    expect(exactIlikePattern('Afrin_banu@neramclasses.com')).toBe('Afrin\\_banu@neramclasses.com');
    expect(exactIlikePattern('a%b*c\\d')).toBe('a\\%b\\*c\\\\d');
  });
});

describe('resolveAdminCaller', () => {
  it('refuses a request with no bearer token without touching the network', async () => {
    const { deps, calls } = makeDeps({});
    const r = await resolveAdminCaller(null, deps);
    expect(r).toMatchObject({ ok: false, status: 401 });
    expect(calls).toEqual([]);
  });

  it('accepts a staff member found by ms_oid', async () => {
    const { deps, calls } = makeDeps({ byOid: [admin] });
    const r = await resolveAdminCaller('Bearer real-token', deps);
    expect(r).toEqual({ ok: true, userId: 'u-admin', userType: 'admin', via: 'graph' });
    expect(calls.some((c) => c.includes('email=ilike.'))).toBe(false);
  });

  it('falls back to the token email, case-insensitively', async () => {
    const { deps, calls } = makeDeps({ byOid: [], byEmail: [{ ...admin, ms_oid: null, user_type: 'teacher' }] });
    const r = await resolveAdminCaller('Bearer real-token', deps);
    expect(r).toMatchObject({ ok: true, userType: 'teacher' });
    expect(calls.find((c) => c.includes('email=ilike.'))).toContain(encodeURIComponent('Staff@neramclasses.com'));
  });

  it('refuses when two rows share the email instead of guessing', async () => {
    const { deps } = makeDeps({ byOid: [], byEmail: [admin, { ...admin, id: 'u-2' }] });
    expect(await resolveAdminCaller('Bearer t', deps)).toMatchObject({ ok: false, status: 403 });
  });

  it('refuses a student and an unknown account with 403', async () => {
    const student = makeDeps({ byOid: [{ ...admin, user_type: 'student' }] });
    expect(await resolveAdminCaller('Bearer t', student.deps)).toMatchObject({ ok: false, status: 403 });
    const unknown = makeDeps({ byOid: [], byEmail: [] });
    expect(await resolveAdminCaller('Bearer t', unknown.deps)).toMatchObject({ ok: false, status: 403 });
  });

  it('answers 401 when Graph rejects the token and 500 when it is unreachable', async () => {
    expect(await resolveAdminCaller('Bearer t', makeDeps({ graph: { status: 401 } }).deps)).toMatchObject({
      ok: false,
      status: 401,
    });
    expect(await resolveAdminCaller('Bearer t', makeDeps({ graph: 'throw' }).deps)).toMatchObject({
      ok: false,
      status: 500,
    });
  });

  it('answers 500, not 403, when the database lookup fails', async () => {
    expect(await resolveAdminCaller('Bearer t', makeDeps({ byOid: 'error' }).deps)).toMatchObject({
      ok: false,
      status: 500,
    });
  });

  it('accepts a test token only when test tokens are allowed', async () => {
    const token = `Bearer test_${Buffer.from('e2etestingteacher@neramclasses.com').toString('base64')}`;
    const allowed = makeDeps({ allowTestTokens: true, byEmail: [{ ...admin, user_type: 'teacher' }] });
    expect(await resolveAdminCaller(token, allowed.deps)).toMatchObject({ ok: true, via: 'test' });
    expect(allowed.calls.some((c) => c.startsWith('https://graph.microsoft.com'))).toBe(false);

    // In production the same string is just an invalid Microsoft token.
    const prod = makeDeps({ allowTestTokens: false, graph: { status: 401 } });
    expect(await resolveAdminCaller(token, prod.deps)).toMatchObject({ ok: false, status: 401 });
    expect(prod.calls.some((c) => c.startsWith('https://graph.microsoft.com'))).toBe(true);
  });

  it('serves a repeat call from the cache and does not cache refusals', async () => {
    const cache = new AdminCallerCache(60_000);
    const ok = makeDeps({ byOid: [admin], cache });
    await resolveAdminCaller('Bearer same', ok.deps);
    const second = await resolveAdminCaller('Bearer same', ok.deps);
    expect(second).toMatchObject({ ok: true, via: 'cache' });
    expect(ok.fetchImpl).toHaveBeenCalledTimes(2); // Graph + ms_oid lookup, once

    const refused = makeDeps({ byOid: [{ ...admin, user_type: 'student' }], cache: new AdminCallerCache() });
    await resolveAdminCaller('Bearer x', refused.deps);
    await resolveAdminCaller('Bearer x', refused.deps);
    expect(refused.fetchImpl).toHaveBeenCalledTimes(4);
  });
});

describe('AdminCallerCache', () => {
  it('expires entries and caps its size', () => {
    const cache = new AdminCallerCache(100, 2);
    cache.set('a', { userId: '1', userType: 'admin' }, 0);
    expect(cache.get('a', 99)).not.toBeNull();
    expect(cache.get('a', 100)).toBeNull();
    cache.set('b', { userId: '2', userType: 'admin' }, 0);
    cache.set('c', { userId: '3', userType: 'admin' }, 0);
    cache.set('d', { userId: '4', userType: 'admin' }, 0);
    expect(cache.get('b', 1)).toBeNull();
    expect(cache.get('d', 1)).not.toBeNull();
  });
});
