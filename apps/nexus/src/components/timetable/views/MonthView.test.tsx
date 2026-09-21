import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MonthView from './MonthView';
import { formatDateISO, getMonthGrid } from '../date-utils';
import { addDaysYmd } from '@/lib/away-windows';
import type { DayForecast } from '@/lib/class-forecast';

/**
 * The month grid used to carry a grey "N away" pill in all thirty-five cells,
 * on finished dates as much as on future ones. Repeating one word thirty-five
 * times is the same as saying nothing, and it answered the wrong question:
 * a teacher deciding whether to hold a class is asking who WILL be there.
 *
 * So the assertions here are mostly about restraint. Nothing on a past date,
 * nothing shouted on an ordinary one, and the warning reserved for the handful
 * of nights that are actually worth a second look.
 */

vi.mock('@/components/students/StudentAvatar', () => ({
  default: ({ userId }: { userId: string }) => <span data-avatar={userId} />,
}));

const TODAY = formatDateISO(new Date());
const on = (n: number) => addDaysYmd(TODAY, n);

const forecast = (date: string, over: Partial<DayForecast> = {}): DayForecast => ({
  date,
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

function show(
  forecasts: Record<string, DayForecast>,
  over: Partial<React.ComponentProps<typeof MonthView>> = {},
) {
  const anchor = new Date(`${TODAY}T00:00:00`);
  return render(
    <MonthView
      classes={[]}
      month={getMonthGrid(anchor)}
      role="teacher"
      anchorISO={TODAY}
      forecastByDate={forecasts}
      todayISO={TODAY}
      onOpenDayAvailability={() => {}}
      {...over}
    />,
  );
}

const cells = () => screen.getAllByTestId('month-cell');

/**
 * jsdom answers no to every media query, so `down('md')` is false and it is the
 * full desktop grid that renders here. The accessible name lives on the day
 * figure itself rather than on the cell, because the cell's own button is the
 * "schedule here" target sitting behind the chips.
 */
const dayName = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });

const labelFor = (iso: string) =>
  Array.from(document.querySelectorAll('[data-turnout]'))
    .map((el) => el.getAttribute('aria-label') || '')
    .find((l) => l.includes(dayName(iso))) || '';

describe('the day figure in a month cell', () => {
  it('says how many are coming, not how many are away', () => {
    const { container } = show({ [on(2)]: forecast(on(2)) });
    expect(labelFor(on(2))).toMatch(/~16 of 30/);

    // What the cell SHOWS is four characters and a ratio. "away" was the word
    // repeated in all thirty-five cells, and the reason the grid read as a wall
    // of grey text. It still reaches a screen reader through the label below,
    // where repetition costs nothing.
    const pill = container.querySelector('[data-turnout]');
    expect(pill?.textContent).toBe('~16 of 30');
    expect(container.textContent).not.toMatch(/away/);
  });

  it('carries the whole sum for a screen reader', () => {
    show({ [on(2)]: forecast(on(2)) });
    expect(labelFor(on(2))).toMatch(/30 on roll, 9 away, 1 stepped out, 4 rarely come/);
  });

  it('offers nothing at all on a date that is already over', () => {
    // A forecast for a finished night is a prediction about the past. The
    // register holds what actually happened.
    const { container } = show({ [on(-3)]: forecast(on(-3)) });
    expect(container.textContent).not.toMatch(/of 30/);
    expect(labelFor(on(-3))).not.toMatch(/likely/);
  });

  it('still answers for today, which is not over', () => {
    show({ [TODAY]: forecast(TODAY) });
    expect(labelFor(TODAY)).toMatch(/~16 of 30/);
  });

  it('shows nothing to a student, whatever it is handed', () => {
    const { container } = show({ [on(2)]: forecast(on(2)) }, { role: 'student' });
    expect(container.textContent).not.toMatch(/of 30/);
  });
});

describe('the tilde', () => {
  it('appears only when something was actually discounted', () => {
    show({ [on(2)]: forecast(on(2)) });
    expect(labelFor(on(2))).toMatch(/~16 of 30/);
  });

  it('is absent when the count is a fact rather than an estimate', () => {
    // A number with no estimate in it must not be dressed up as one, or the
    // teacher learns to distrust the digits on every other cell too.
    show({ [on(2)]: forecast(on(2), { atRisk: 0, likely: 20, estimated: false }) });
    const label = labelFor(on(2));
    expect(label).toMatch(/20 of 30/);
    expect(label).not.toMatch(/~/);
  });
});

describe('what is loud and what is quiet', () => {
  const turnoutOn = (iso: string) =>
    Array.from(document.querySelectorAll('[data-turnout]'))
      .find((el) => (el.getAttribute('aria-label') || '').includes(dayName(iso)))
      ?.getAttribute('data-turnout') ?? null;

  it('stays quiet on an ordinary day', () => {
    show({ [on(2)]: forecast(on(2), { likely: 26, atRisk: 4, expected: 30 }) });
    expect(turnoutOn(on(2))).toBe('good');
  });

  it('marks a thin night, and not by colour alone', () => {
    show({ [on(2)]: forecast(on(2), { likely: 8, onRoll: 30 }) });
    expect(turnoutOn(on(2))).toBe('very_thin');
    // The glyph is what carries it for a reader who cannot separate the tones.
    const pill = document.querySelector('[data-turnout="very_thin"]');
    expect(pill?.querySelector('svg')).toBeTruthy();
  });

  it('draws no glyph on a good day, so the marked ones stand out', () => {
    show({ [on(2)]: forecast(on(2), { likely: 26, onRoll: 30 }) });
    expect(document.querySelector('[data-turnout="good"] svg')).toBeFalsy();
  });
});

describe('degrading', () => {
  it('renders the grid untouched when no forecast arrived', () => {
    const { container } = show({});
    expect(cells().length).toBeGreaterThan(27);
    expect(container.textContent).not.toMatch(/of 30/);
  });

  it('renders nothing for a date the forecast does not cover', () => {
    show({ [on(2)]: forecast(on(2)) });
    expect(labelFor(on(4))).not.toMatch(/likely/);
  });
});
