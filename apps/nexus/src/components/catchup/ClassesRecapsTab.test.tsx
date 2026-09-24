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
  default: ({ classTitle }: { classTitle: string }) => <div>panel for {classTitle}</div>,
}));

import ClassesRecapsTab, { type ClassesViewProps } from './ClassesRecapsTab';
import { classHealth, type CalendarClass } from '@/lib/catchup-calendar';

/**
 * The Classes view of Catch-up (2026-10): month scoped, calendar first, with
 * the old card list behind a toggle. It stopped being a work list before that:
 * the sweep publishes recaps on its own, so the view opens with what the
 * automation did, and the escape hatches live in a menu.
 */
const TODAY = '2026-09-24';

function cls(over: Partial<CalendarClass> = {}): CalendarClass {
  const base = {
    id: 'class-1',
    title: 'Key Indian Monuments',
    scheduled_date: '2026-09-09',
    start_time: '18:00',
    present: 17,
    missed: 19,
    late_joiners: 0,
    caughtUp: 2,
    outstanding: 17,
    blocked: 0,
    recap_state: 'published' as const,
    recap_id: 'recap-1',
    has_transcript: true,
    teams_meeting_id: 'meeting-1',
    not_taught: false,
    ...over,
  };
  return { ...base, health: over.health ?? classHealth(base, TODAY) };
}

function props(classes: CalendarClass[] | null, over: Partial<ClassesViewProps> = {}): ClassesViewProps {
  return {
    classroomId: 'room-1',
    classes,
    today: TODAY,
    month: '2026-09',
    onMonth: vi.fn(),
    display: 'list',
    onDisplay: vi.fn(),
    openClassId: null,
    onOpenClass: vi.fn(),
    onReload: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the Classes view: list', () => {
  it('opens by saying what published itself this month, not by asking for work', async () => {
    render(
      <ClassesRecapsTab
        {...props([cls({ id: 'c-1' }), cls({ id: 'c-2', outstanding: 0, missed: 0 })])}
      />,
    );
    await waitFor(() => expect(screen.getByText(/2 of 2 classes/)).toBeTruthy());
    expect(screen.getByText(/in September 2026 are live for students/)).toBeTruthy();
  });

  it('leaves upcoming classes and other months out of the list', async () => {
    render(
      <ClassesRecapsTab
        {...props([cls({ id: 'past' }), cls({ id: 'soon', scheduled_date: '2026-09-28', title: 'Next week' }), cls({ id: 'aug', scheduled_date: '2026-08-31', title: 'Spill day' })])}
      />,
    );
    await waitFor(() => expect(screen.getByText(/1 of 1 classes/)).toBeTruthy());
    expect(screen.queryByText('Next week')).toBeNull();
    expect(screen.queryByText('Spill day')).toBeNull();
  });

  it('says so plainly when everyone has caught up', async () => {
    render(<ClassesRecapsTab {...props([cls({ outstanding: 0, missed: 2, caughtUp: 2 })])} />);
    await waitFor(() => expect(screen.getByText(/Everyone who missed a class has caught up/)).toBeTruthy());
  });

  it('keeps the manual backfill in a menu, not as the main action', async () => {
    render(<ClassesRecapsTab {...props([cls()])} />);
    expect(screen.queryByRole('button', { name: /Prepare missing classes/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /More recap actions/ }));
    expect(await screen.findByText('Prepare missing classes')).toBeTruthy();
    expect(screen.getByText('Recap from a link')).toBeTruthy();
  });

  it('offers a way out for a session that was not a class, naming who it clears', async () => {
    render(
      <ClassesRecapsTab
        {...props([cls({ title: 'Class Postponed Due to Exams', missed: 18, caughtUp: 1, outstanding: 17 })])}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: /More actions for Class Postponed/ }));
    fireEvent.click(await screen.findByText('No class was taught'));
    expect(await screen.findByText(/The attendance register stays exactly as it is/)).toBeTruthy();
    expect(screen.getByText(/17 students stop owing a catch-up/)).toBeTruthy();
    expect(screen.getByText(/1 student has already worked through this/)).toBeTruthy();
  });

  it('shows a skeleton, not an empty state, while the month loads', () => {
    render(<ClassesRecapsTab {...props(null)} />);
    expect(screen.queryByText(/No classes were taught/)).toBeNull();
  });
});

describe('the Classes view: calendar', () => {
  it('puts each class on its day with words, not only a colour', async () => {
    render(<ClassesRecapsTab {...props([cls()], { display: 'calendar' })} />);
    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeTruthy();
    // The phone layout (jsdom has no wide viewport): the day cell names the class
    // and its state in its accessible label.
    expect(screen.getByRole('gridcell', { name: /Key Indian Monuments: 17 to catch up/ })).toBeTruthy();
  });

  it('moves between months', () => {
    const onMonth = vi.fn();
    render(<ClassesRecapsTab {...props([], { display: 'calendar', onMonth })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(onMonth).toHaveBeenCalledWith('2026-10');
  });

  it('opens the class drawer from a deep link, with the way back to the timetable', async () => {
    render(
      <ClassesRecapsTab
        {...props([cls()], { display: 'calendar', openClassId: 'class-1', backHref: '/teacher/timetable' })}
      />,
    );
    expect(await screen.findByText('panel for Key Indian Monuments')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Back to timetable/ }).getAttribute('href')).toBe('/teacher/timetable');
  });
});
