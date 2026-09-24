import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MonthView from './MonthView';
import GridView from './GridView';
import ClassCard, { type ClassCardData } from '../ClassCard';
import { getMonthGrid, getWeekDatesFor, resolveBand } from '../date-utils';
import { indexCatchup } from '../catchup-badge';
import type { CalendarClass } from '@/lib/catchup-calendar';

/**
 * The catch-up badge on the staff timetable. What matters: it appears only
 * where the page hands it data, the words are always there (never colour
 * alone), a tap goes to the class on the Catch-up calendar, and the student
 * timetable, which passes nothing, is untouched.
 */

vi.mock('next/link', () => ({
  // jsdom cannot navigate, so the stand-in stops at the click like the real
  // client-side Link does.
  default: ({ href, children, prefetch: _p, onClick, ...rest }: any) => (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        e.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));

vi.mock('@/components/students/StudentAvatar', () => ({
  default: ({ userId }: { userId: string }) => <span data-avatar={userId} />,
}));

// A fixed date. The views never compare the badge against the clock; which
// classes earn one is decided by the server's health and indexCatchup.
const DATE = '2026-09-09';
const anchor = new Date(`${DATE}T00:00:00`);

const klass = (over: Partial<ClassCardData> = {}): ClassCardData =>
  ({
    id: 'k1',
    title: 'Perspective drawing',
    scheduled_date: DATE,
    start_time: '19:00:00',
    end_time: '20:00:00',
    status: 'completed',
    teams_meeting_url: null,
    teams_meeting_join_url: null,
    teams_meeting_id: null,
    teams_meeting_scope: null,
    recording_url: null,
    batch_id: null,
    topic: null,
    teacher: null,
    batch: null,
    ...over,
  }) as ClassCardData;

const health = (over: Partial<CalendarClass> = {}): CalendarClass => ({
  id: 'k1',
  title: 'Perspective drawing',
  scheduled_date: DATE,
  start_time: '19:00:00',
  present: 20,
  missed: 3,
  late_joiners: 0,
  caughtUp: 0,
  outstanding: 3,
  blocked: 0,
  recap_state: 'published',
  recap_id: 'r1',
  has_transcript: true,
  teams_meeting_id: null,
  not_taught: false,
  health: 'catching_up',
  ...over,
});

const HREF = `/teacher/catch-up?view=calendar&month=2026-09&class=k1&from=timetable`;

describe('Month view (desktop grid)', () => {
  const month = getMonthGrid(anchor);

  it('puts a dot on the chip and the words in its label and title', () => {
    const { container } = render(
      <MonthView
        classes={[klass()]}
        month={month}
        role="teacher"
        anchorISO={DATE}
        catchupByClassId={indexCatchup([health()])}
      />,
    );
    const chip = container.querySelector('[data-catchup]') as HTMLElement;
    expect(chip).not.toBeNull();
    expect(chip.getAttribute('data-catchup')).toBe('catching_up');
    expect(chip.getAttribute('aria-label')).toContain('Catch-up: 3 to catch up');
    expect(chip.getAttribute('title')).toContain('3 to catch up');
    expect(chip.querySelector('[data-testid="catchup-dot"]')).not.toBeNull();
  });

  it('draws nothing when the page passes no data', () => {
    const { container } = render(
      <MonthView classes={[klass()]} month={month} role="teacher" anchorISO={DATE} />,
    );
    expect(container.querySelector('[data-catchup]')).toBeNull();
    expect(container.querySelector('[data-testid="catchup-dot"]')).toBeNull();
  });

  it('ignores the data for a student', () => {
    const { container } = render(
      <MonthView
        classes={[klass()]}
        month={month}
        role="student"
        anchorISO={DATE}
        catchupByClassId={indexCatchup([health()])}
      />,
    );
    expect(container.querySelector('[data-testid="catchup-dot"]')).toBeNull();
  });
});

describe('Week grid', () => {
  const week = getWeekDatesFor(anchor);
  const band = resolveBand([{ start: '18:00', end: '21:00' }], [klass()]);

  it('lays a link to the Catch-up calendar over the block', () => {
    render(
      <GridView
        classes={[klass()]}
        week={week}
        band={band}
        role="teacher"
        catchupByClassId={indexCatchup([health({ health: 'recap_missing', blocked: 2 })])}
      />,
    );
    const badge = screen.getByTestId('catchup-badge');
    expect(badge.tagName).toBe('A');
    expect(badge.getAttribute('href')).toBe(HREF);
    expect(badge.textContent).toBe('Recap missing, 2 waiting');
    // A sibling of the block, never inside it: a link inside role="button"
    // would be a nested control.
    const block = screen.getByTestId('grid-class-block');
    expect(block.contains(badge)).toBe(false);
    expect(block.getAttribute('aria-label')).toContain('Catch-up: Recap missing, 2 waiting');
  });

  it('shows no badge for a class the map leaves out', () => {
    render(
      <GridView
        classes={[klass()]}
        week={week}
        band={band}
        role="teacher"
        catchupByClassId={indexCatchup([
          health({ health: 'all_caught_up', missed: 0, outstanding: 0 }),
        ])}
      />,
    );
    expect(screen.queryByTestId('catchup-badge')).toBeNull();
  });
});

describe('Class card', () => {
  it('shows the badge, and a tap on it does not also open the class', () => {
    const onClick = vi.fn();
    render(
      <ClassCard
        cls={klass()}
        role="teacher"
        onClick={onClick}
        catchupByClassId={indexCatchup([health({ health: 'all_caught_up', missed: 2, outstanding: 0 })])}
      />,
    );
    const badge = screen.getByTestId('catchup-badge');
    expect(badge.textContent).toBe('All caught up');
    expect(badge.getAttribute('href')).toBe(HREF);
    badge.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('is unchanged without the prop', () => {
    render(<ClassCard cls={klass()} role="teacher" />);
    expect(screen.queryByTestId('catchup-badge')).toBeNull();
  });
});
