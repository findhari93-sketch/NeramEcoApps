import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup, act } from '@testing-library/react';

/**
 * Starting or leaving View as Student changes who the app is signed in as
 * (PERF-0055).
 *
 * On a device with a cached shell, `loading` was pinned to false after boot, so
 * while /api/auth/me loaded the new identity the context still described the old
 * one. The student layout's guard saw a teacher and bounced, and on Exit the
 * teacher's return page saw a student and bounced to the student dashboard. A
 * slow refresh started before the switch could also land last and put the old
 * identity back.
 */

const msal = vi.hoisted(() => ({ user: { id: 'oid-t', name: 'T' }, loading: false, signIn: () => {}, signOut: () => {} }));
vi.mock('@neram/auth', () => ({
  useMicrosoftAuth: () => msal,
  getAccessToken: vi.fn(async () => 'token-t'),
  getAccessTokenSilent: vi.fn(async () => 'token-t'),
  loginScopes: { default: [], nexus: [], nexusTeacher: [], nexusFileSearch: [] },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/teacher/dashboard',
}));

import { NexusAuthProvider, useNexusAuthContext } from './useNexusAuth';
import { writeCachedAuth } from '@/lib/auth-cache';

const TEACHER = {
  user: { id: 'u-t', ms_oid: 'oid-t', name: 'T', email: 't@neramclasses.com' },
  nexusRole: 'teacher',
  classrooms: [{ id: 'c1' }],
};
const STUDENT = {
  user: { id: 'stu-1', ms_oid: 'oid-s', name: 'S', email: 's@neramclasses.com' },
  nexusRole: 'student',
  classrooms: [{ id: 'c1' }],
};

/** /api/auth/me answers at once, or waits for release() while `hold` is on. */
let hold = false;
let pending: { token: string; answer: () => void }[] = [];
function release(token: string) {
  const i = pending.findIndex((p) => p.token === token);
  const [p] = pending.splice(i, 1);
  p.answer();
}

const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

function fetchMock(url: string, init?: RequestInit) {
  if (url === '/api/auth/impersonate') {
    return Promise.resolve(
      reply({
        token: 'imp_x',
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        impersonatorName: 'T',
        student: { id: 'stu-1', name: 'S', email: null, avatar_url: null, ms_oid: 'oid-s' },
      }),
    );
  }
  if (url === '/api/auth/impersonate/end') return Promise.resolve(reply({ ok: true }));
  const token = String((init?.headers as Record<string, string>)?.Authorization ?? '').replace('Bearer ', '');
  const body = token === 'imp_x' ? STUDENT : TEACHER;
  if (!hold) return Promise.resolve(reply(body));
  return new Promise((resolve) => pending.push({ token, answer: () => resolve(reply(body)) }));
}

let ctx: ReturnType<typeof useNexusAuthContext>;
function Probe() {
  ctx = useNexusAuthContext();
  return null;
}

async function bootAsTeacher() {
  render(<NexusAuthProvider><Probe /></NexusAuthProvider>);
  await waitFor(() => expect(ctx.nexusRole).toBe('teacher'));
  await waitFor(() => expect(ctx.loading).toBe(false));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  hold = false;
  pending = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // A warm device: last session's answer is cached, so the shell boots without a spinner.
  writeCachedAuth('oid-t', TEACHER);
  vi.stubGlobal('fetch', vi.fn(fetchMock));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe('switching identity with View as Student', () => {
  it("covers the switch to the student with loading, instead of showing the teacher's shell", async () => {
    await bootAsTeacher();
    hold = true;

    await act(async () => {
      await ctx.startImpersonation('stu-1');
    });
    expect(ctx.loading).toBe(true);

    await act(async () => {
      await waitFor(() => expect(pending).toHaveLength(1));
      release('imp_x');
    });
    await waitFor(() => expect(ctx.nexusRole).toBe('student'));
    expect(ctx.loading).toBe(false);
  });

  it('covers the exit the same way, so the return page is not judged as the student', async () => {
    await bootAsTeacher();
    await act(async () => {
      await ctx.startImpersonation('stu-1');
    });
    await waitFor(() => expect(ctx.nexusRole).toBe('student'));
    await waitFor(() => expect(ctx.loading).toBe(false));

    hold = true;
    await act(async () => {
      await ctx.exitImpersonation();
    });
    expect(ctx.loading).toBe(true);

    await act(async () => {
      await waitFor(() => expect(pending).toHaveLength(1));
      release('token-t');
    });
    await waitFor(() => expect(ctx.nexusRole).toBe('teacher'));
    expect(ctx.loading).toBe(false);
  });

  it('does not let a slow refresh from before the switch put the old identity back', async () => {
    await bootAsTeacher();
    hold = true;

    // A refresh as the teacher is still in flight when View as Student starts.
    let refresh: Promise<void> = Promise.resolve();
    act(() => {
      refresh = ctx.refreshAuth();
    });
    await act(async () => {
      await ctx.startImpersonation('stu-1');
    });
    await act(async () => {
      await waitFor(() => expect(pending.map((p) => p.token).sort()).toEqual(['imp_x', 'token-t']));
      release('imp_x');
    });
    await waitFor(() => expect(ctx.nexusRole).toBe('student'));

    // The teacher's answer lands last.
    await act(async () => {
      release('token-t');
      await refresh;
    });
    expect(ctx.nexusRole).toBe('student');
    expect(ctx.user?.id).toBe('stu-1');
  });
});
