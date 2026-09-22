import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Sidebar rows were buttons calling router.push (PERF-0029): no prefetch, no
 * "open in new tab", and a screen reader heard a button. They are links now, and
 * the current page is marked with aria-current.
 */

const push = vi.fn();
let pathname = '/teacher/students';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push, prefetch: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/hooks/useNexusAuth', () => ({
  useNexusAuthContext: () => ({ user: { id: 'u1', name: 'T' }, nexusRole: 'teacher', impersonation: { active: false } }),
}));
vi.mock('./SidebarProvider', () => ({
  SIDEBAR_EXPANDED: 260,
  SIDEBAR_ICONS: 72,
  useSidebarContext: () => ({ sidebarState: 'expanded', cycle: vi.fn(), toggle: vi.fn(), expand: vi.fn() }),
}));
vi.mock('./NavBadgeProvider', () => ({ useNavBadges: () => ({ getBadgeCount: () => 0 }) }));
vi.mock('@/lib/qb-exam-routes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/qb-exam-routes')>()),
  useRememberedQBExam: () => null,
}));

import DesktopSidebar from './DesktopSidebar';

const icon = null;
const GROUPS = [
  {
    label: 'Teaching',
    items: [
      { label: 'Classrooms', path: '/teacher/classrooms', icon },
      { label: 'Students', path: '/teacher/students', icon },
      {
        label: 'Library',
        path: '/teacher/library',
        icon,
        children: [{ label: 'Engagement', path: '/teacher/library/engagement', icon }],
      },
    ],
  },
];

beforeEach(() => {
  push.mockClear();
  pathname = '/teacher/students';
});
afterEach(() => cleanup());

describe('DesktopSidebar rows', () => {
  it('are real links to their pages', () => {
    render(<DesktopSidebar groups={GROUPS} homePath="/teacher/dashboard" />);
    expect(screen.getByRole('link', { name: 'Classrooms' }).getAttribute('href')).toBe('/teacher/classrooms');
    expect(screen.getByRole('link', { name: 'Students' }).getAttribute('href')).toBe('/teacher/students');
  });

  it('mark the current page', () => {
    render(<DesktopSidebar groups={GROUPS} homePath="/teacher/dashboard" />);
    expect(screen.getByRole('link', { name: 'Students' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Classrooms' }).getAttribute('aria-current')).toBeNull();
  });

  it('link folder children too', () => {
    pathname = '/teacher/library/engagement';
    render(<DesktopSidebar groups={GROUPS} homePath="/teacher/dashboard" />);
    expect(screen.getByRole('link', { name: 'Engagement' }).getAttribute('href')).toBe('/teacher/library/engagement');
  });

  it('link the Home button', () => {
    render(<DesktopSidebar groups={GROUPS} homePath="/teacher/dashboard" />);
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/teacher/dashboard');
  });

  it('navigate on a plain click', () => {
    render(<DesktopSidebar groups={GROUPS} homePath="/teacher/dashboard" />);
    fireEvent.click(screen.getByRole('link', { name: 'Classrooms' }));
    expect(push).toHaveBeenCalledWith('/teacher/classrooms');
  });
});
