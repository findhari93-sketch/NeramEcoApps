import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup, act } from '@testing-library/react';

/**
 * "Could not reach Nexus" is not "signed out".
 *
 * On a device with no cached shell, every /api/auth/me failure used to leave `user`
 * null with only an `error` string that nothing read, so RoleGuard sent a signed-in
 * person to the sign-in page. A hung /me held the full-screen spinner for as long as
 * the origin kept the request open, up to Cloudflare's 100s (PERF-0026).
 *
 * The provider now says which it was: `authUnavailable` for a server fault, a
 * network failure or a 15s timeout, and not for a real 401 or 404, which still
 * means the session is gone.
 */

// One stable object, as MSAL's hook returns: the provider's effect depends on it,
// and a new object per render would reload /api/auth/me on every render.
const msal = vi.hoisted(() => ({ user: { id: 'oid-1', name: 'T' }, loading: false, signIn: () => {}, signOut: () => {} }));
vi.mock('@neram/auth', () => ({
  useMicrosoftAuth: () => msal,
  getAccessToken: vi.fn(async () => 'token'),
  getAccessTokenSilent: vi.fn(async () => 'token'),
  loginScopes: { default: [], nexus: [], nexusTeacher: [], nexusFileSearch: [] },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/teacher/dashboard',
}));

import { NexusAuthProvider, useNexusAuthContext, ME_TIMEOUT_MS } from './useNexusAuth';

let ctx: ReturnType<typeof useNexusAuthContext>;
function Probe() {
  ctx = useNexusAuthContext();
  return null;
}
const mount = () => render(<NexusAuthProvider><Probe /></NexusAuthProvider>);

function answerMe(status: number) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status < 300, status, json: async () => ({ error: 'x' }) })));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('telling "could not reach Nexus" from "signed out"', () => {
  it('flags a server fault (500) as unavailable', async () => {
    answerMe(500);
    mount();
    await waitFor(() => expect(ctx.authUnavailable).toBe(true));
    expect(ctx.user).toBeNull();
    expect(ctx.loading).toBe(false);
  });

  it('flags a network failure as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    mount();
    await waitFor(() => expect(ctx.authUnavailable).toBe(true));
  });

  it('does not flag a rejected session (401): that one really is signed out', async () => {
    answerMe(401);
    mount();
    await waitFor(() => expect(ctx.error).toBeTruthy());
    expect(ctx.authUnavailable).toBe(false);
  });

  it('gives up on a /me that never answers, instead of spinning until the platform cuts it', async () => {
    vi.useFakeTimers();
    let aborted = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              aborted = true;
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }),
      ),
    );
    mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ME_TIMEOUT_MS + 10);
    });
    expect(aborted).toBe(true);
    expect(ctx.authUnavailable).toBe(true);
    expect(ctx.loading).toBe(false);
  });
});

/**
 * View as Student used to end on ANY failed /me, so a server fault or a database
 * blip threw the teacher back to their own view mid-session (PERF-0014). Only a
 * refusal (4xx) means the impersonation token is dead.
 */
describe('View as Student survives an outage', () => {
  const impersonating = () =>
    sessionStorage.setItem(
      'nexus_impersonation',
      JSON.stringify({
        token: 'imp_x',
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        impersonatorName: 'A Teacher',
        student: { id: 'stu-1', name: 'A Student', email: null, avatar_url: null, ms_oid: 'oid-stu' },
        returnUrl: null,
      }),
    );

  it.each([500, 503])('keeps the student view when /me answers %i', async (status) => {
    impersonating();
    answerMe(status);
    mount();
    await waitFor(() => expect(ctx.authUnavailable).toBe(true));
    expect(ctx.impersonation.active).toBe(true);
    expect(sessionStorage.getItem('nexus_impersonation')).not.toBeNull();
  });

  it('still ends it when /me refuses the token (401)', async () => {
    impersonating();
    answerMe(401);
    mount();
    await waitFor(() => expect(ctx.impersonation.active).toBe(false));
    expect(sessionStorage.getItem('nexus_impersonation')).toBeNull();
  });
});
