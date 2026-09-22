import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup, act } from '@testing-library/react';

/**
 * An expired Microsoft session must never navigate away under the user (PERF-0054).
 *
 * getToken asks MSAL with getAccessToken, which answers "interaction required" with
 * a full-page redirect to Microsoft. The 60s badge and bell pollers and the student
 * heartbeat all called it, so whichever timer noticed an expired session first sent
 * the page away mid-sentence. Background callers now use getTokenSilently, which
 * never redirects: it flags `sessionExpired`, and the user chooses when to sign in.
 */

const msal = vi.hoisted(() => ({
  hook: { user: { id: 'oid-t', name: 'T' }, loading: false, signIn: () => {}, signOut: () => {} },
  getAccessToken: vi.fn(async () => 'token-t'),
  signInSilent: vi.fn(),
}));
vi.mock('@neram/auth', () => ({
  useMicrosoftAuth: () => msal.hook,
  getAccessToken: msal.getAccessToken,
  getAccessTokenSilent: vi.fn(async () => 'token-t'),
  signInSilent: msal.signInSilent,
  loginScopes: { default: [], nexus: ['nexus'], nexusTeacher: [], nexusFileSearch: [] },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/teacher/dashboard',
}));

import { NexusAuthProvider, useNexusAuthContext } from './useNexusAuth';

let ctx: ReturnType<typeof useNexusAuthContext>;
function Probe() {
  ctx = useNexusAuthContext();
  return null;
}

async function mount() {
  render(<NexusAuthProvider><Probe /></NexusAuthProvider>);
  await waitFor(() => expect(ctx.nexusRole).toBe('teacher'));
  msal.getAccessToken.mockClear();
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  msal.signInSilent.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ user: { id: 'u-t', ms_oid: 'oid-t', name: 'T' }, nexusRole: 'teacher', classrooms: [{ id: 'c1' }] }),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('getTokenSilently', () => {
  it('hands out the token when MSAL can renew it silently', async () => {
    msal.signInSilent.mockResolvedValue({ accessToken: 'fresh' });
    await mount();

    let token: string | null = null;
    await act(async () => {
      token = await ctx.getTokenSilently();
    });
    expect(token).toBe('fresh');
    expect(ctx.sessionExpired).toBe(false);
  });

  it('flags an expired session instead of redirecting the page', async () => {
    msal.signInSilent.mockResolvedValue(null); // MSAL needs the user to act
    await mount();

    let token: string | null = 'unset';
    await act(async () => {
      token = await ctx.getTokenSilently();
    });
    expect(token).toBeNull();
    expect(ctx.sessionExpired).toBe(true);
    // The redirecting getter was never touched.
    expect(msal.getAccessToken).not.toHaveBeenCalled();
  });

  it('does not call a network blip an expired session', async () => {
    msal.signInSilent.mockRejectedValue(new TypeError('Failed to fetch'));
    await mount();

    let token: string | null = 'unset';
    await act(async () => {
      token = await ctx.getTokenSilently();
    });
    expect(token).toBeNull();
    expect(ctx.sessionExpired).toBe(false);
  });

  it('hands out the View as Student token without asking MSAL', async () => {
    sessionStorage.setItem(
      'nexus_impersonation',
      JSON.stringify({
        token: 'imp_x',
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        impersonatorName: 'T',
        student: { id: 'stu-1', name: 'S', email: null, avatar_url: null, ms_oid: 'oid-s' },
        returnUrl: null,
      }),
    );
    render(<NexusAuthProvider><Probe /></NexusAuthProvider>);
    await waitFor(() => expect(ctx.impersonation.active).toBe(true));

    await expect(ctx.getTokenSilently()).resolves.toBe('imp_x');
    expect(msal.signInSilent).not.toHaveBeenCalled();
  });
});

describe('renewSession', () => {
  it('signs in again through the interactive getter, only when the user asks', async () => {
    msal.signInSilent.mockResolvedValue(null);
    await mount();
    await act(async () => {
      await ctx.getTokenSilently();
    });
    expect(msal.getAccessToken).not.toHaveBeenCalled();

    await act(async () => {
      await ctx.renewSession();
    });
    expect(msal.getAccessToken).toHaveBeenCalledWith(['nexus']);
    // In the test the interactive getter answers with a token instead of navigating.
    expect(ctx.sessionExpired).toBe(false);
  });
});
