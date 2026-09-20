import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/useNexusAuth', () => ({
  useNexusAuthContext: () => ({ getTeacherToken: async () => 'token' }),
}));
vi.mock('@/components/curriculum/shared', () => ({
  useAuthFetch: () => async (url: string) => {
    if (url.includes('review-queue')) return { items: [], count: 0 };
    if (url.includes('question-reports')) return { items: [], count: 0 };
    return {};
  },
}));
vi.mock('@/components/timetable/attendance/ClassAttendancePanel', () => ({
  default: () => null,
}));

import ClassesRecapsTab from './ClassesRecapsTab';
import { emptyTally } from '@/lib/catchup-buckets';
import type { ClassStat, Payload, TabProps } from './types';

/**
 * This tab stopped being a work list.
 *
 * It used to open with a queue of recaps to make and a "Needs a recap" filter,
 * from the days when a recap was made by pressing a button. The sweep now runs
 * every fifteen minutes after a class ends and publishes on its own, so the
 * first thing on the screen is what the automation did, and the only work list
 * is the short one above it: questions a student reported, and the rare recap
 * the pipeline could not publish.
 */
function classStat(over: Partial<ClassStat> = {}): ClassStat {
  return {
    id: 'class-1',
    title: 'Key Indian Monuments',
    scheduled_date: '2026-09-09',
    present: 17,
    missed: 19,
    caughtUp: 2,
    outstanding: 17,
    blocked: 0,
    recap_state: 'published',
    recap_id: 'recap-1',
    has_transcript: true,
    teams_meeting_id: 'meeting-1',
    ...over,
  };
}

function payload(classStats: ClassStat[]): Payload {
  return {
    classroomId: 'room-1',
    students: [],
    classes: [],
    classStats,
    reasons: [],
    reasonTally: { unwell: 0, family: 0, clash: 0, other: 0 },
    completed: [],
    noRecording: [],
    pendingRecap: [],
    totals: {
      studentsBehind: 0,
      studentsCatchingUp: 0,
      outstanding: 0,
      clearedThisMonth: 0,
      explained: 0,
      unexplained: 0,
      byBucket: emptyTally(),
      hiddenDormant: 0,
    },
  };
}

function props(classStats: ClassStat[]): TabProps {
  return {
    data: payload(classStats),
    busy: null,
    onAct: vi.fn(),
    onNudge: vi.fn(),
    onNudgeMany: vi.fn(async () => {}),
    onReload: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the Classes and recaps tab', () => {
  it('opens by saying what published itself, not by asking for work', async () => {
    render(
      <ClassesRecapsTab
        {...props([
          classStat({ id: 'c-1' }),
          classStat({ id: 'c-2', recap_state: 'published', outstanding: 0, missed: 0 }),
        ])}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText(/2 of 2 classes/)).toBeTruthy(),
    );
    expect(screen.getByText(/published automatically after each class ended/)).toBeTruthy();
  });

  it('offers no "Needs a recap" filter, because making one is not a teacher job', async () => {
    render(<ClassesRecapsTab {...props([classStat({ recap_state: 'recording_ready' })])} />);

    // A class with a recording and no recap yet: exactly what the old chip
    // selected for. It is not live, and it is not a teacher's job either.
    await waitFor(() => expect(screen.getByText(/0 of 1 classes/)).toBeTruthy());
    expect(screen.queryByText(/Needs a recap/)).toBeNull();
  });

  it('says so plainly when everyone has caught up', async () => {
    render(
      <ClassesRecapsTab
        {...props([classStat({ outstanding: 0, missed: 2, caughtUp: 2 })])}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText(/Everyone who missed a class has caught up/)).toBeTruthy(),
    );
  });

  it('counts the students still working through a class', async () => {
    render(<ClassesRecapsTab {...props([classStat({ outstanding: 17 })])} />);

    await waitFor(() =>
      expect(screen.getByText(/1 still have someone working through them/)).toBeTruthy(),
    );
  });

  it('keeps the manual backfill reachable but not as the main action', async () => {
    render(<ClassesRecapsTab {...props([classStat()])} />);

    const button = await screen.findByRole('button', { name: /Prepare missing classes/ });
    // Outlined, not contained: pressing it is exactly the manual step the
    // pipeline exists to remove, and it is kept only for a Teams outage or a
    // spent Gemini budget.
    expect(button.className).toContain('MuiButton-outlined');
  });

  /**
   * The 2026-09-18 card: the tutor opened the meeting only to say the class was
   * postponed for school exams. Seventeen students were left owing a catch-up
   * for it, and the two buttons on the row were Continue draft (write a recap
   * of an announcement) and Follow up 17 (chase them over it). There was no
   * third option anywhere in Nexus.
   */
  it('offers a way out for a session that was not a class', async () => {
    render(
      <ClassesRecapsTab
        {...props([
          classStat({ title: 'Class Postponed Due to Exams', missed: 18, caughtUp: 1 }),
        ])}
      />,
    );

    const more = await screen.findByRole('button', {
      name: /More actions for Class Postponed Due to Exams/,
    });
    // An overflow rather than a third button: "Follow up 17" and "Continue
    // draft" already fill the row at 375px.
    fireEvent.click(more);

    expect(await screen.findByText('No class was taught')).toBeTruthy();
  });

  it('names who it is about to clear, and promises the register is safe', async () => {
    render(
      <ClassesRecapsTab
        {...props([
          classStat({ title: 'Class Postponed Due to Exams', missed: 18, caughtUp: 1 }),
        ])}
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: /More actions for Class Postponed/ }),
    );
    fireEvent.click(await screen.findByText('No class was taught'));

    // Attendance first. It is the thing a teacher fears losing, and the only
    // other lever on a finished class does destroy it.
    expect(
      await screen.findByText(/The attendance register stays exactly as it is/),
    ).toBeTruthy();
    expect(screen.getByText(/17 students stop owing a catch-up/)).toBeTruthy();
    expect(screen.getByText(/1 student has already worked through this/)).toBeTruthy();
  });

  it('shows nothing needing a person when the queue is empty', async () => {
    render(<ClassesRecapsTab {...props([classStat()])} />);

    await waitFor(() => expect(screen.getByText(/are live for students/)).toBeTruthy());
    expect(screen.queryByText(/things need you/)).toBeNull();
    expect(screen.queryByText(/thing needs you/)).toBeNull();
  });
});
