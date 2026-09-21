import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DayForecastCard from './DayForecastCard';
import { formatDateISO } from './date-utils';
import { addDaysYmd } from '@/lib/away-windows';
import { MIN_GLYPH_SIZE } from '@/components/students/StudentStageAvatar';
import type { DayForecast, ForecastStudent, RarelyComes } from '@/lib/class-forecast';
import type {
  AwayStudentRow,
  DeclinedStudentRow,
  RsvpDaySummary,
  RsvpSummary,
} from '@/app/api/timetable/rsvp-dashboard/route';

/**
 * The card answers "should I run Thursday", and it has to show its working.
 *
 * The count on its own is not actionable: the founder's ask was to be able to
 * open the day, see WHY the number is what it is, and disagree with it. So the
 * sum is on the card and every discounted student is named with the evidence.
 */

// Captures what StudentAvatar was asked for, which is how the ring regression
// below is caught: the real component silently draws a ring with no glyph.
vi.mock('@/components/students/StudentAvatar', () => ({
  default: ({ userId, size }: { userId: string; size?: number }) => (
    <span data-avatar={userId} data-size={size} />
  ),
}));

const TODAY = formatDateISO(new Date());
const on = (n: number) => addDaysYmd(TODAY, n);
const NO_REASONS = { unwell: 0, family: 0, clash: 0, other: 0 };

const sum = (over: Partial<RsvpSummary> = {}): RsvpSummary => ({
  attending: 20,
  not_attending: 1,
  total: 21,
  on_roll: 30,
  away: 9,
  ...over,
});

const day = (over: Partial<RsvpDaySummary> = {}): RsvpDaySummary => ({
  date: on(2),
  summary: sum(),
  away_ids: ['away1'],
  declined_ids: ['dec1'],
  also_declined_ids: [],
  reason_tally: { ...NO_REASONS, clash: 1 },
  away_tally: { ...NO_REASONS, clash: 9 },
  class_ids: ['c1'],
  ...over,
});

const forecast = (over: Partial<DayForecast> = {}): DayForecast => ({
  date: on(2),
  expected: 20,
  onRoll: 30,
  away: 9,
  declined: 1,
  atRisk: 4,
  likely: 16,
  estimated: true,
  newcomers: [],
  scheduled: true,
  ...over,
});

const rarely = (id: string, present: number, judged: number): RarelyComes => ({
  id,
  name: id,
  avatar_url: null,
  record: { judged, rate: Math.round((present / judged) * 100), rarely: true },
});

const joiner = (id: string): ForecastStudent => ({
  id,
  name: id,
  avatar_url: null,
  batch_id: null,
  enrolled_at: `${on(-2)}T09:00:00+05:30`,
  present: 1,
  counted: 1,
  away: 0,
  standing: 'new',
});

function show(over: Partial<React.ComponentProps<typeof DayForecastCard>> = {}) {
  const d = over.day ?? day();
  return render(
    <DayForecastCard
      day={d}
      classes={[]}
      today={TODAY}
      now={new Date()}
      awayById={
        new Map<string, AwayStudentRow>([
          ['away1', { id: 'away1', name: 'Away One', avatar_url: null, windows: [] }],
        ])
      }
      declinedById={
        new Map<string, DeclinedStudentRow>([
          ['dec1', { id: 'dec1', name: 'Declined One', avatar_url: null }],
        ])
      }
      forecast={forecast()}
      expanded
      onToggle={() => {}}
      {...over}
    />,
  );
}

describe('the headline', () => {
  it('leads with the realistic count', () => {
    show();
    expect(screen.getByText('~16 of 30 likely')).toBeTruthy();
  });

  it('shows the sum behind it, in the order it is subtracted', () => {
    show();
    expect(screen.getByText('30 on roll, 9 away, 1 stepped out, 4 rarely come')).toBeTruthy();
  });

  it('drops the terms that are zero rather than printing them', () => {
    show({ forecast: forecast({ away: 0, declined: 0, atRisk: 0, likely: 20, estimated: false }) });
    expect(screen.getByText('30 on roll')).toBeTruthy();
  });

  it('says available, not expected, on a date with nothing scheduled', () => {
    // Nobody has been asked, so no reply can be claimed.
    show({
      day: day({ class_ids: [], declined_ids: [], summary: sum({ not_attending: 0, total: 20 }) }),
      forecast: forecast({ scheduled: false }),
    });
    expect(screen.getByText(/~16 of 30 available/)).toBeTruthy();
  });
});

describe('the students who gave no reason', () => {
  it('names them with the evidence, not just a count', () => {
    show({ rarelyComing: [rarely('Aarav', 2, 18)] });
    expect(screen.getByText('Aarav')).toBeTruthy();
    expect(screen.getByText('In 2 of the last 18 classes (11%)')).toBeTruthy();
  });

  it('separates them from the students who did give one', () => {
    show({ rarelyComing: [rarely('Aarav', 2, 18)] });
    expect(screen.getByText('Rarely comes, no reason given')).toBeTruthy();
    expect(screen.getByText('Away One')).toBeTruthy();
    expect(screen.getByText('Declined One')).toBeTruthy();
  });

  it('marks a recent joiner as new rather than as a risk', () => {
    show({ newcomers: [joiner('Priya')] });
    expect(screen.getByText('New')).toBeTruthy();
    expect(screen.getByText(/Too recent to read anything/)).toBeTruthy();
  });

  it('says nothing about them at all when the record could not be read', () => {
    show({ rarelyComing: [], forecast: null });
    expect(screen.queryByText(/Rarely comes/)).toBeNull();
    // Falls back to the entitled count, with no tilde and no opinion.
    expect(screen.getByText('20 of 30 likely')).toBeTruthy();
  });
});

describe('the avatars', () => {
  /**
   * THE REGRESSION THIS FILE EXISTS FOR.
   *
   * These rendered at 26 and StudentStageAvatar hides the stage glyph and the
   * language mark below MIN_GLYPH_SIZE. The ring drew a coloured circle that
   * said nothing: no exam year, no paused state, no spoken language, while
   * every other teacher screen showed all three. It failed silently, because a
   * ring with no glyph still looks deliberate.
   */
  it('are big enough for the info ring to actually say something', () => {
    show({ rarelyComing: [rarely('Aarav', 2, 18)], newcomers: [joiner('Priya')] });
    const sizes = Array.from(document.querySelectorAll('[data-avatar]')).map((el) =>
      Number(el.getAttribute('data-size')),
    );
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(MIN_GLYPH_SIZE);
  });

  it('identifies every face by user id, so the ring can be resolved', () => {
    show({ rarelyComing: [rarely('Aarav', 2, 18)] });
    const ids = Array.from(document.querySelectorAll('[data-avatar]')).map((el) =>
      el.getAttribute('data-avatar'),
    );
    expect(ids).toContain('away1');
    expect(ids).toContain('dec1');
    expect(ids).toContain('Aarav');
  });
});
