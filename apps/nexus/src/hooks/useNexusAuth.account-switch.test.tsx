import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';

/**
 * A different person signing in on the same device must not inherit the previous
 * person's cached screens.
 *
 * The device caches are keyed on the account id taken from /api/auth/me's
 * `user.ms_oid`. The route never sent it, so every account was stored under "no
 * owner", the account-switch purge compared null with null, and the second person
 * booted from the first person's data (PERF-0025). This pins the contract between
 * the route's payload and the hook.
 */

// One stable object, as MSAL's hook returns: the provider's effect depends on it,
// and a new object per render would reload /api/auth/me on every render.
const msal = vi.hoisted(() => ({ user: { id: 'oid-b', name: 'B' }, loading: false, signIn: () => {}, signOut: () => {} }));
vi.mock('@neram/auth', () => ({
  useMicrosoftAuth: () => msal,
  getAccessToken: vi.fn(async () => 'token-b'),
  getAccessTokenSilent: vi.fn(async () => 'token-b'),
  loginScopes: { default: [], nexus: [], nexusTeacher: [], nexusFileSearch: [] },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/student/dashboard',
}));

import { NexusAuthProvider } from './useNexusAuth';
import { readCachedAuth, writeCachedAuth } from '@/lib/auth-cache';

const PREVIOUS_ACCOUNT_BUCKET = 'nexus_swr_cache_v1:dev:oid-a';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // Account A used this device last.
  writeCachedAuth('oid-a', { user: { id: 'ua', name: 'A' }, nexusRole: 'student', classrooms: [{ id: 'c1' }] });
  localStorage.setItem(
    PREVIOUS_ACCOUNT_BUCKET,
    JSON.stringify({ savedAt: Date.now(), entries: [['/api/student/catchup-journey', { data: { name: 'A' } }]] }),
  );
  // Account B signs in; the route answers in its real shape.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        user: { id: 'ub', ms_oid: 'oid-b', name: 'B', email: 'b@neramclasses.com' },
        nexusRole: 'student',
        classrooms: [{ id: 'c2' }],
      }),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('a second account signing in on the same device', () => {
  it("drops the previous account's cached data and stores the new account's own id", async () => {
    render(<NexusAuthProvider><main /></NexusAuthProvider>);

    await waitFor(() => expect(readCachedAuth()?.oid).toBe('oid-b'));
    expect(localStorage.getItem(PREVIOUS_ACCOUNT_BUCKET)).toBeNull();
  });
});
