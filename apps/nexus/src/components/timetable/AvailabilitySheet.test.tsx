import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AvailabilitySheet, { type AvailabilityScope } from './AvailabilitySheet';
import { formatDateISO } from './date-utils';
import { addDaysYmd } from '@/lib/away-windows';
import type {
  RsvpClassSummary,
  RsvpDashboardRangeResponse,
  RsvpDaySummary,
  RsvpSummary,
} from '@/app/api/timetable/rsvp-dashboard/route';

/**
 * The planner looks FORWARD.
 *
 * Almost every test here is really one assertion in disguise: the sheet answers
 * about the days ahead, anchored on today, and never about meetings that are
 * already over. The version this replaced reported on whatever the calendar was
 * showing, so on the 20th it opened with eight finished classes and an away
 * roll counting the whole surrounding month grid.
 *
 * Dates are built relative to the real today rather than with a frozen clock:
 * the horizon is derived from `new Date()` inside the component, and faking
 * timers around MUI's Collapse transitions buys flakiness for nothing.
 */

vi.mock('@/components/students/StudentAvatar', () => ({
  default: ({ userId }: { userId: string }) => <span data-avatar={userId} />,
}));

// The fallback fetch only fires when the page's payload does not reach far
// enough, which no fixture here does. Mocked so the hook does not go looking
// for an auth provider that this sheet is not what decides the behaviour of.
vi.mock('@/lib/nexus-swr', () => ({
  useAuthSWR: () => ({ data: undefined, isLoading: false }),
}));

const TODAY = formatDateISO(new Date());
/** `n` days from today. Negative is the past. */
const on = (n: number) => addDaysYmd(TODAY, n);

const NO_REASONS = { unwell: 0, family: 0, clash: 0, other: 0 };

const sum = (over: Partial<RsvpSummary> = {}): RsvpSummary => ({
  attending: 28,
  not_attending: 0,
  total: 28,
  on_roll: 28,
  away: 0,
  ...over,
});

const day = (date: string, over: Partial<RsvpDaySummary> = {}): RsvpDaySummary => ({
  date,
  summary: sum(),
  away_ids: [],
  declined_ids: [],
  also_declined_ids: [],
  reason_tally: { ...NO_REASONS },
  away_tally: { ...NO_REASONS },
  class_ids: [],
  ...over,
});

const cls = (over: Partial<RsvpClassSummary> = {}): RsvpClassSummary => ({
  class_id: 'c1',
  title: 'Perspective drawing',
  scheduled_date: on(2),
  start_time: '19:00',
  end_time: '20:00',
  batch_id: null,
  status: 'scheduled',
  summary: sum({ attending: 18, not_attending: 4, total: 22, on_roll: 28, away: 6 }),
  away_ids: ['a1'],
  declined_ids: ['d1'],
  also_declined_ids: [],
  reason_tally: { ...NO_REASONS, unwell: 4 },
  away_tally: { ...NO_REASONS, clash: 6 },
  ...over,
});

const win = (startsOn: string, endsOn: string | null) => ({
  id: `w-${startsOn}`,
  student_id: 'a1',
  starts_on: startsOn,
  ends_on: endsOn,
  reason_code: 'clash',
  reason_note: null,
  source: 'student',
  cancelled_at: null,
  created_at: '2026-08-01T00:00:00Z',
});

/** A payload that comfortably spans every horizon chip. */
function data(over: Partial<RsvpDashboardRangeResponse> = {}): RsvpDashboardRangeResponse {
  const days: RsvpDaySummary[] = [];
  for (let i = -10; i <= 40; i++) days.push(day(on(i)));

  const base: RsvpDashboardRangeResponse = {
    range: { start: on(-10), end: on(40) },
    classes: [cls()],
    days,
    roster_total: 28,
    away_students: [
      { id: 'a1', name: 'Nethra Ranjith', avatar_url: null, windows: [win(on(1), on(8))] },
    ],
    declined_students: [{ id: 'd1', name: 'Kaveya Rameshbabu', avatar_url: null }],
    ...over,
  };

  // Keep the class's own day row consistent with the class unless overridden.
  if (!over.days) {
    for (const c of base.classes) {
      const row = base.days.find((d) => d.date === c.scheduled_date);
      if (row) {
        row.class_ids = [c.class_id];
        row.summary = c.summary;
        row.away_ids = c.away_ids;
        row.declined_ids = c.declined_ids;
        row.reason_tally = c.reason_tally;
        row.away_tally = c.away_tally;
      }
    }
  }
  return base;
}

const PERIOD: AvailabilityScope = { kind: 'period' };

const show = (scope: AvailabilityScope, payload: RsvpDashboardRangeResponse | undefined = data()) => {
  render(
    <AvailabilitySheet
      open
      onClose={() => {}}
      scope={scope}
      data={payload}
      loading={false}
      classroomId={null}
      onOpenClass={() => {}}
      onSchedule={() => {}}
    />,
  );
  return document.body;
};

describe('the horizon starts at today', () => {
  it('opens on the next 14 days and says so', () => {
    show(PERIOD);
    expect(screen.getByText(/Next 14 days/)).toBeTruthy();
  });

  it('renders no date before today', () => {
    const body = show(PERIOD);
    for (let i = -10; i < 0; i++) {
      expect(body.querySelector(`[data-day="${on(i)}"]`)).toBeNull();
    }
    expect(body.querySelector(`[data-day="${TODAY}"]`)).toBeTruthy();
  });

  /** Quiet days fold away by default, so open them before measuring the edge. */
  const expandClear = () =>
    fireEvent.click(screen.getByRole('button', { name: /clear days, good to schedule/ }));

  it('stops at the end of the horizon', () => {
    const body = show(PERIOD);
    expandClear();
    expect(body.querySelector(`[data-day="${on(13)}"]`)).toBeTruthy();
    expect(body.querySelector(`[data-day="${on(14)}"]`)).toBeNull();
  });

  it('narrows and widens on the chips, without refetching', () => {
    const body = show(PERIOD);
    expandClear();

    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(body.querySelector(`[data-day="${on(6)}"]`)).toBeTruthy();
    expect(body.querySelector(`[data-day="${on(7)}"]`)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '30 days' }));
    expect(body.querySelector(`[data-day="${on(29)}"]`)).toBeTruthy();
    expect(body.querySelector(`[data-day="${on(30)}"]`)).toBeNull();
  });

  it('marks the active chip for anything that is not reading the colour', () => {
    show(PERIOD);
    expect(screen.getByRole('button', { name: '14 days' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '7 days' }).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('past classes', () => {
  const withPast = () => {
    const payload = data();
    payload.classes = [
      cls(),
      cls({ class_id: 'old', title: 'Cube composition', scheduled_date: on(-4) }),
    ];
    return payload;
  };

  it('are absent until asked for', () => {
    show(PERIOD, withPast());
    expect(screen.queryByText('Cube composition')).toBeNull();
  });

  it('come back behind the toggle, so nothing is lost', () => {
    show(PERIOD, withPast());
    fireEvent.click(screen.getByRole('button', { name: /Show past classes \(1\)/ }));
    expect(screen.getByText('Cube composition')).toBeTruthy();
  });
});

describe('a date with nothing scheduled, which is the whole point', () => {
  it('says available rather than expected, because nobody was asked', () => {
    const payload = data();
    const free = payload.days.find((d) => d.date === on(3))!;
    free.summary = sum({ attending: 26, not_attending: 0, total: 26, on_roll: 28, away: 2 });
    free.away_ids = ['a1'];
    free.away_tally = { ...NO_REASONS, clash: 2 };

    const body = show(PERIOD, payload);
    const card = body.querySelector(`[data-day="${on(3)}"]`)!;

    expect(card.textContent).toContain('26 of 28 available');
    expect(card.textContent).not.toContain('expected');
    expect(card.textContent).toContain('Nothing scheduled yet, so nobody has been asked.');
  });

  it('offers to schedule one, which is the next thing the teacher does', () => {
    const payload = data();
    const free = payload.days.find((d) => d.date === on(3))!;
    free.away_ids = ['a1'];

    const body = show(PERIOD, payload);
    const card = body.querySelector(`[data-day="${on(3)}"]`)!;
    expect(card.querySelector('button')).toBeTruthy();
    expect(card.textContent).toContain('Schedule a class');
  });

  it('folds the days with nothing on them and nobody out into one line', () => {
    const body = show(PERIOD);
    // Only the class's day and today are notable; the rest are clear.
    expect(screen.getByText(/clear days, good to schedule/)).toBeTruthy();
    expect(body.querySelector(`[data-day="${on(5)}"]`)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /clear days, good to schedule/ }));
    expect(body.querySelector(`[data-day="${on(5)}"]`)).toBeTruthy();
  });
});

describe('the verdict, which is what turns a count into a decision', () => {
  const withTurnout = (attending: number, away: number) => {
    const payload = data();
    const d = payload.days.find((x) => x.date === on(2))!;
    d.summary = sum({ attending, not_attending: 0, total: attending, on_roll: attending + away, away });
    d.away_ids = away > 0 ? ['a1'] : [];
    d.away_tally = { ...NO_REASONS, clash: away };
    return payload;
  };

  it('calls a night with most of the class out very thin', () => {
    const body = show(PERIOD, withTurnout(11, 16));
    expect(body.querySelector(`[data-day="${on(2)}"] [data-turnout="very_thin"]`)).toBeTruthy();
  });

  it('calls a full night good', () => {
    const body = show(PERIOD, withTurnout(27, 1));
    expect(body.querySelector(`[data-day="${on(2)}"] [data-turnout="good"]`)).toBeTruthy();
  });

  it('spells the reasons out on the face of the card', () => {
    const payload = data();
    const d = payload.days.find((x) => x.date === on(2))!;
    d.summary = sum({ attending: 13, not_attending: 0, total: 13, on_roll: 27, away: 14 });
    d.away_ids = ['a1'];
    d.away_tally = { unwell: 2, family: 3, clash: 9, other: 0 };

    const body = show(PERIOD, payload);
    const card = body.querySelector(`[data-day="${on(2)}"]`)!;
    expect(card.textContent).toContain('14 away');
    expect(card.textContent).toContain('2 unwell, 3 family, 9 exam clash');
  });
});

describe('the away roll', () => {
  it('counts the horizon, not whatever range was fetched', () => {
    // The regression this rewrite fixes. The payload spans 51 days and names a
    // student away on days 1 to 8; a second student is away well outside the
    // 14-day horizon and must not be counted.
    const payload = data();
    payload.away_students = [
      ...payload.away_students,
      { id: 'a2', name: 'Far Away', avatar_url: null, windows: [win(on(35), on(38))] },
    ];
    payload.days.find((d) => d.date === on(36))!.away_ids = ['a2'];

    show(PERIOD, payload);
    expect(screen.getByText(/Away in these 14 days \(1\)/)).toBeTruthy();
  });

  it('names each student once and draws the bar against the horizon', () => {
    const body = show(PERIOD);
    fireEvent.click(screen.getByRole('button', { name: /Away in these 14 days/ }));
    expect(screen.getAllByText('Nethra Ranjith')).toHaveLength(1);
    expect(body.querySelector('[data-away-bar]')).toBeTruthy();
  });
});

describe('one class, asked from its own panel', () => {
  const CLASS: AvailabilityScope = { kind: 'class', classId: 'c1', date: on(2) };

  it('keeps the headline and reconciles it against the roll', () => {
    show(CLASS);
    expect(screen.getByText('18 of 22 expected')).toBeTruthy();
    expect(screen.getByText(/28 on roll/)).toBeTruthy();
    expect(screen.getByText(/6 away/)).toBeTruthy();
  });

  it('names the away student with the window read against the class date', () => {
    show(CLASS);
    expect(screen.getByText('Nethra Ranjith')).toBeTruthy();
  });

  it('is not filtered by the horizon, and shows no chips', () => {
    show(CLASS);
    expect(screen.queryByRole('button', { name: '7 days' })).toBeNull();
  });

  it('says so when the whole class is in', () => {
    const payload = data();
    payload.classes = [
      cls({ summary: sum(), away_ids: [], declined_ids: [], reason_tally: { ...NO_REASONS } }),
    ];
    show(CLASS, payload);
    expect(screen.getByText(/The whole class is in/)).toBeTruthy();
  });
});

describe('one day, asked from the month view pill', () => {
  it('shows that day only, already open', () => {
    const body = show({ kind: 'day', date: on(2) });
    expect(body.querySelector(`[data-day="${on(2)}"]`)).toBeTruthy();
    expect(body.querySelector(`[data-day="${on(3)}"]`)).toBeNull();
    // Expanded without a tap: one card is not a list to scan.
    expect(screen.getByText('Nethra Ranjith')).toBeTruthy();
  });
});

describe('the quiet cases', () => {
  it('shows skeletons rather than a confident wrong number while loading', () => {
    render(
      <AvailabilitySheet
        open
        onClose={() => {}}
        scope={PERIOD}
        data={undefined}
        loading
        classroomId={null}
      />,
    );
    expect(document.body.querySelector('.MuiSkeleton-root')).toBeTruthy();
  });

  it('says out loud what the headline count does and does not include', () => {
    show(PERIOD);
    expect(screen.getByText(/Away students are not counted/)).toBeTruthy();
    // The discount is the part a teacher would otherwise have to guess at.
    expect(screen.getByText(/rarely turn up is taken off the likely count/)).toBeTruthy();
  });

  it('reports nothing rather than an empty headline when no day rows arrived', () => {
    show(PERIOD, data({ days: [] }));
    expect(screen.getByText(/Nothing to report for these days yet/)).toBeTruthy();
  });
});
