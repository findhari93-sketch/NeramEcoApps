import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

/**
 * Staff need a classroom before Nexus opens, the same as students (decided
 * 2026-09-22, PERF-0038). What differs is who fixes it and how, so a teacher
 * must not be shown the student welcome ("You've made an excellent choice
 * joining us", "Your teacher adds you").
 */

let auth: Record<string, unknown>;
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => auth }));

import NoClassroomWelcome from './NoClassroomWelcome';

const teamsMessage = () => {
  const href = screen.getByRole('link', { name: /teams/i }).getAttribute('href') ?? '';
  return new URL(href).searchParams.get('message') ?? '';
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));
  auth = {
    user: { name: 'Asha Rao', email: 'asha@neramclasses.com' },
    nexusRole: 'student',
    signOut: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('NoClassroomWelcome', () => {
  it.each(['teacher', 'admin'])('tells a %s they need to be added to a classroom as a teacher', (role) => {
    auth.nexusRole = role;
    render(<NoClassroomWelcome />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/not in a classroom yet/i);
    expect(screen.getByText(/Teachers tab/i).textContent).toMatch(/Add Teacher/);
    expect(teamsMessage()).toMatch(/as a teacher/i);
    expect(teamsMessage()).toMatch(/asha@neramclasses\.com/);
  });

  it('does not show a teacher the student welcome', () => {
    auth.nexusRole = 'teacher';
    render(<NoClassroomWelcome />);

    expect(screen.queryByText(/excellent choice/i)).toBeNull();
    expect(screen.queryByText(/your teacher adds you/i)).toBeNull();
    expect(screen.queryByText('Live Classes')).toBeNull();
  });

  it('keeps the student welcome for a student', () => {
    render(<NoClassroomWelcome />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/welcome to neram classes/i);
    expect(screen.getByText('Live Classes')).toBeTruthy();
    expect(screen.getByText(/your teacher adds you/i)).toBeTruthy();
    expect(teamsMessage()).not.toMatch(/as a teacher/i);
  });

  it('keeps Sign Out for everyone', () => {
    auth.nexusRole = 'teacher';
    render(<NoClassroomWelcome />);

    expect(screen.getByRole('button', { name: /sign out/i })).toBeTruthy();
  });
});
