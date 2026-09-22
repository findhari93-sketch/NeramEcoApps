import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

/**
 * The bell polls the unread count every 60s. With the redirecting getToken, an
 * expired Microsoft session sent the whole page to Microsoft sign-in from that
 * timer (PERF-0054), so the bell hands its poller the silent getter.
 */

const getToken = vi.fn(async () => 'interactive');
const getTokenSilently = vi.fn(async () => 'silent');
vi.mock('@/hooks/useNexusAuth', () => ({
  useNexusAuthContext: () => ({ getToken, getTokenSilently, nexusRole: 'teacher' }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const useUserNotifications = vi.fn((_opts: { getIdToken: () => Promise<string | null> }) => ({
  unreadCount: 0,
  notifications: [],
  loading: false,
  fetchNotifications: vi.fn(),
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
}));
vi.mock('@neram/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@neram/ui')>()),
  useUserNotifications: (opts: { getIdToken: () => Promise<string | null> }) => useUserNotifications(opts),
}));

import NotificationBell from './NotificationBell';

afterEach(() => cleanup());

describe('NotificationBell', () => {
  it('gives its background poller the silent token getter', () => {
    render(<NotificationBell />);
    expect(useUserNotifications.mock.calls[0][0].getIdToken).toBe(getTokenSilently);
  });
});
