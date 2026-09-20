import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Insights } from '@/components/timetable/attendance/types';
import ClassRegisterPage from './page';

/**
 * The class page's own logic: which neighbour class prev/next point at, and
 * that it asks the register API for the same range the teacher arrived with,
 * not the API's own 30-day default. Everything about grouping, search and the
 * expand row is covered in depth by ClassRegisterList.test.tsx; this file only
 * covers what belongs to the page itself.
 */

const mocks = vi.hoisted(() => ({
  auth: { activeClassroom: { id: 'room1' }, getToken: vi.fn() },
  params: new Map<string, string | null>(),
  authSWR: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ classId: 'c2' }),
  useSearchParams: () => ({ get: (key: string) => mocks.params.get(key) ?? null }),
}));
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => mocks.auth }));
vi.mock('@/lib/nexus-swr', () => ({ useAuthSWR: (key: string | null) => mocks.authSWR(key) }));

const INSIGHTS = {
  class: {
    id: 'c2',
    title: 'Basic 3D Shape Composition',
    scheduled_date: '2026-09-15',
    start_time: '19:00:00',
    end_time: '20:30:00',
    attendance_synced_at: null,
    attendance_sync_message: null,
    has_meeting: true,
    teams_meeting_id: 'meeting-1',
    measured: true,
  },
  summary: {
    held: { start: '2026-09-15T13:30:00.000Z', end: '2026-09-15T14:40:00.000Z', source: 'observed', minutes: 70 },
  },
  students: [],
} as unknown as Insights;

function registerWith(ids: string[]) {
  return {
    classroom_id: 'room1',
    range: { from: '2026-06-20', to: '2026-09-18' },
    // Newest first, matching the real route: index 0 is the most recent class.
    classes: ids.map((id) => ({ id })),
    students: [],
    cells: {},
    paused_hidden: 0,
  };
}

function mockSwr(register: unknown) {
  mocks.authSWR.mockImplementation((key: string | null) => {
    if (!key) return { data: undefined, error: undefined, isLoading: false };
    if (key.includes('/api/timetable/class-insights')) {
      return { data: INSIGHTS, error: undefined, isLoading: false };
    }
    if (key.includes('/api/attendance/register')) {
      return { data: register, error: undefined, isLoading: false };
    }
    return { data: undefined, error: undefined, isLoading: true };
  });
}

beforeEach(() => {
  mocks.params = new Map([
    ['view', 'classes'],
    ['range', '90'],
  ]);
  mocks.authSWR.mockReset();
});

describe('ClassRegisterPage, neighbouring classes', () => {
  it('asks the register for the range the teacher arrived with, not the API default', () => {
    mockSwr(registerWith(['c3', 'c2', 'c1']));
    render(<ClassRegisterPage />);

    const registerCall = mocks.authSWR.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('/api/attendance/register'),
    );
    // The teacher arrived on the 90-day view (range=90 in the URL), so the
    // fetch must carry an explicit from/to for that window, not fall back to
    // the register route's own 30-day default.
    expect(registerCall?.[0]).toMatch(/classroom_id=room1&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
  });

  it('shows the caption and both arrows when the class is inside the fetched range', () => {
    mockSwr(registerWith(['c3', 'c2', 'c1']));
    render(<ClassRegisterPage />);

    expect(screen.getByText('class 2 of 3')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Previous class' }).getAttribute('href')).toBe(
      '/teacher/attendance/c1?view=classes&range=90',
    );
    expect(screen.getByRole('link', { name: 'Next class' }).getAttribute('href')).toBe(
      '/teacher/attendance/c3?view=classes&range=90',
    );
  });

  it('renders no caption and no arrows when the class falls outside the fetched range', () => {
    // The bug this guards: a stale or mismatched range fetch can return a list
    // that never includes the class actually being viewed. A wrong count
    // ("class 0 of 2") is worse than none, so the page must show neither the
    // caption nor a pair of dead arrows.
    mockSwr(registerWith(['other-1', 'other-2']));
    render(<ClassRegisterPage />);

    expect(screen.queryByText(/class \d+ of \d+/)).toBe(null);
    expect(screen.queryByRole('link', { name: 'Previous class' })).toBe(null);
    expect(screen.queryByRole('link', { name: 'Next class' })).toBe(null);
  });
});

describe('ClassRegisterPage, a class attendance has not been read for', () => {
  // Finding 1: the class screen used to compute a group for every roster
  // member off an empty attendance table (everyone `attended: false`),
  // rendering four tiles where everyone read as missed. The old warning Alert
  // only fired when `attendance_sync_status` was set and not 'ok', so a
  // class that simply had never synced (status null) fell straight through
  // it. Gating on `measured` instead covers that class too.
  it('says attendance has not been read, instead of every student, when nothing has synced', () => {
    const unmeasured = {
      ...INSIGHTS,
      class: { ...INSIGHTS.class, measured: false, attendance_sync_message: null },
    } as unknown as Insights;
    mocks.authSWR.mockImplementation((key: string | null) => {
      if (!key) return { data: undefined, error: undefined, isLoading: false };
      if (key.includes('/api/timetable/class-insights')) {
        return { data: unmeasured, error: undefined, isLoading: false };
      }
      if (key.includes('/api/attendance/register')) {
        return { data: registerWith(['c2']), error: undefined, isLoading: false };
      }
      return { data: undefined, error: undefined, isLoading: true };
    });

    render(<ClassRegisterPage />);

    expect(screen.getByText(/Attendance has not been read from Teams for this class yet/)).toBeTruthy();
    // No group tile renders at all: this is not "everyone missed", it is
    // "nothing is known yet".
    expect(screen.queryByTestId('stat-tile-whole')).toBe(null);
    expect(screen.queryByTestId('stat-tile-no_reason')).toBe(null);
  });

  it('shows the specific sync failure reason instead of the generic message, when one exists', () => {
    const failed = {
      ...INSIGHTS,
      class: {
        ...INSIGHTS.class,
        measured: false,
        attendance_sync_message: 'Teams has not published an attendance report for this class yet.',
      },
    } as unknown as Insights;
    mocks.authSWR.mockImplementation((key: string | null) => {
      if (!key) return { data: undefined, error: undefined, isLoading: false };
      if (key.includes('/api/timetable/class-insights')) {
        return { data: failed, error: undefined, isLoading: false };
      }
      if (key.includes('/api/attendance/register')) {
        return { data: registerWith(['c2']), error: undefined, isLoading: false };
      }
      return { data: undefined, error: undefined, isLoading: true };
    });

    render(<ClassRegisterPage />);

    expect(screen.getByText('Teams has not published an attendance report for this class yet.')).toBeTruthy();
    expect(screen.queryByTestId('stat-tile-whole')).toBe(null);
  });
});
