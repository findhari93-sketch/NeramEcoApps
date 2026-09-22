import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';

/**
 * A parent session the server refuses must be dropped on the device.
 *
 * Parent sign-out bumps the credential's token_version, so the session left on the
 * parent's other phone is refused on its next open. The provider used to keep that
 * stored session: /api/auth/me failed, `user` stayed null, RoleGuard sent the
 * parent to /parent/login, and the login page saw an "active" session and sent them
 * straight back to /parent/dashboard. Round and round for up to the 12-hour session
 * lifetime, with no sign-out control reachable (PERF-0024).
 *
 * A server blip is different: a 500 says nothing about the session, so it must stay.
 */

vi.mock('@neram/auth', () => ({
  // Parents have no Microsoft account: MSAL settles with nobody signed in.
  useMicrosoftAuth: () => ({ user: null, loading: false, signIn: vi.fn(), signOut: vi.fn() }),
  getAccessToken: vi.fn(async () => null),
  getAccessTokenSilent: vi.fn(async () => null),
  loginScopes: { default: [], nexus: [], nexusTeacher: [], nexusFileSearch: [] },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/parent/dashboard',
}));

import { NexusAuthProvider, useNexusAuthContext } from './useNexusAuth';
import { PARENT_SESSION_KEY, writeParentSession } from '@/lib/parent-session';

let ctx: ReturnType<typeof useNexusAuthContext>;
function Probe() {
  ctx = useNexusAuthContext();
  return null;
}

function answerMe(status: number, body: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: status < 300, status, json: async () => body })),
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  writeParentSession({
    token: 'par_token',
    expiresAt: new Date(Date.now() + 6 * 3_600_000).toISOString(),
    parent: { id: 'p1', name: 'Parent' },
    mustChangePassword: false,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('parent session refused by /api/auth/me', () => {
  it('drops a session the server rejects (401), so the login page can show its form', async () => {
    answerMe(401, { error: 'Parent session is no longer valid' });
    render(<NexusAuthProvider><Probe /></NexusAuthProvider>);

    await waitFor(() => expect(ctx.parentSession.active).toBe(false));
    expect(localStorage.getItem(PARENT_SESSION_KEY)).toBeNull();
  });

  it('keeps the session when the server fails for another reason (500)', async () => {
    answerMe(500, { error: 'Could not load your account' });
    render(<NexusAuthProvider><Probe /></NexusAuthProvider>);

    await waitFor(() => expect(ctx.error).toBeTruthy());
    expect(ctx.parentSession.active).toBe(true);
    expect(localStorage.getItem(PARENT_SESSION_KEY)).not.toBeNull();
  });
});
