import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

/**
 * When /api/auth/me could not be reached, RoleGuard offers a retry instead of
 * treating a signed-in person as signed out (PERF-0026). A genuinely signed-out
 * person is still sent to sign in.
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/teacher/dashboard',
}));

const refreshAuth = vi.fn(async () => {});
let auth: Record<string, unknown>;
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => auth }));

import RoleGuard from './RoleGuard';

const guard = () =>
  render(
    <RoleGuard allowedRoles={['teacher', 'admin']}>
      <main>DASHBOARD</main>
    </RoleGuard>,
  );

beforeEach(() => {
  push.mockReset();
  refreshAuth.mockClear();
  auth = {
    user: null,
    nexusRole: null,
    classrooms: [],
    loading: false,
    authUnavailable: false,
    refreshAuth,
    parentSession: { active: false },
  };
});

afterEach(cleanup);

describe('RoleGuard when /api/auth/me could not be reached', () => {
  it('shows a retry, announced to screen readers, and does not send the person to sign in', () => {
    auth.authUnavailable = true;
    guard();
    expect(screen.getByRole('alert').textContent).toMatch(/could not reach Nexus/i);
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByText('DASHBOARD')).toBeNull();
  });

  it('retries the sign-in check when Try again is pressed', () => {
    auth.authUnavailable = true;
    guard();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refreshAuth).toHaveBeenCalledTimes(1);
  });

  it('still offers a way to sign in again, as a real link', () => {
    auth.authUnavailable = true;
    guard();
    const link = screen.getByRole('link', { name: /sign in again/i });
    expect(link.getAttribute('href')).toMatch(/^\/login/);
  });

  it('sends a signed-out person to sign in, as before', () => {
    guard();
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/login/));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
