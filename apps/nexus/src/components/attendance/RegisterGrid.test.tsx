import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NeramThemeProvider, nexusLightTheme } from '@neram/ui';
import RegisterGrid from './RegisterGrid';
import type { RegisterResponse } from '@/app/api/attendance/register/route';

const DATA: RegisterResponse = {
  classroom_id: 'c1',
  range: { from: '2026-09-01', to: '2026-09-16' },
  classes: [
    {
      id: 'class-1',
      title: 'Basic 3D Shape Composition',
      scheduled_date: '2026-09-15',
      start_time: '19:00:00',
      end_time: '20:30:00',
      held: { start: '2026-09-15T13:30:00.000Z', end: '2026-09-15T14:40:00.000Z', source: 'observed', minutes: 70 },
      measured: true,
      sync_status: 'ok',
      counts: { whole: 1, partly: 1, reason: 1, noReason: 1, joinedLater: 0 },
    },
  ],
  students: [
    { id: 's1', name: 'Student A', avatar_url: null, study_stage: null, enrolled_at: '2026-06-01T00:00:00Z', present: 1, counted: 1, rate: 100 },
    { id: 's2', name: 'Student B', avatar_url: null, study_stage: null, enrolled_at: '2026-06-01T00:00:00Z', present: 1, counted: 1, rate: 100 },
    { id: 's3', name: 'Student C', avatar_url: null, study_stage: null, enrolled_at: '2026-06-01T00:00:00Z', present: 0, counted: 1, rate: 0 },
    { id: 's4', name: 'Student D', avatar_url: null, study_stage: null, enrolled_at: '2026-06-01T00:00:00Z', present: 0, counted: 1, rate: 50 },
  ],
  cells: {
    'class-1': {
      s1: { g: 'whole', min: 70 },
      s2: { g: 'partly', min: 45, early: 25 },
      s3: { g: 'no_reason' },
      s4: { g: 'reason' },
    },
  },
  paused_hidden: 2,
};

/**
 * Small, self-contained WCAG 2 contrast helpers. These read real computed
 * styles off a real render, so a future change that swaps in a tone which only
 * looks safe would fail this again, the way a check against a token's name
 * never could.
 */
function parseRgb(value: string): { r: number; g: number; b: number; a: number } {
  const m = value.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`Not an rgb() colour: "${value}"`);
  const parts = m[1].split(',').map((n) => parseFloat(n.trim()));
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}

/** A semi-transparent colour composited over an opaque one, channel by channel. */
function flatten(
  fg: { r: number; g: number; b: number; a: number },
  bg: { r: number; g: number; b: number },
): { r: number; g: number; b: number } {
  return {
    r: fg.a * fg.r + (1 - fg.a) * bg.r,
    g: fg.a * fg.g + (1 - fg.a) * bg.g,
    b: fg.a * fg.b + (1 - fg.a) * bg.b,
  };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const lin = (c: number) => {
    const n = c / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2 contrast ratio between two opaque colours, always >= 1. */
function contrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** The four groups whose cell carries a tone. `joined_later` is out of scope, see Finding 6. */
const TONE_LETTERS = ['F', 'P', 'R', 'X'] as const;

describe('RegisterGrid', () => {
  it('marks each student with a letter, not colour alone', () => {
    render(<RegisterGrid data={DATA} classHref={(id) => `/teacher/attendance/${id}`} />);
    // Inside the table only: the legend below it prints the same letters.
    const grid = within(screen.getByRole('table'));
    expect(grid.getByText('F')).toBeTruthy();
    expect(grid.getByText('P')).toBeTruthy();
    expect(grid.getByText('X')).toBeTruthy();
  });

  it('spells out each mark for a screen reader', () => {
    render(<RegisterGrid data={DATA} classHref={(id) => `/teacher/attendance/${id}`} />);
    const cell = screen.getByLabelText(/Student B, Tue 15 Sep: partly there, 45 min, left 25 min early/i);
    expect(cell.getAttribute('href')).toBe('/teacher/attendance/class-1?student=s2');
  });

  it('shows the month in the class column header, not just the day', () => {
    render(<RegisterGrid data={DATA} classHref={(id) => `/teacher/attendance/${id}`} />);
    // A header of just "15" and "Tue" (the old bug) would fail this: the month
    // must be visible, because the range spans up to 90 days and two classes on
    // the 15th of different months would otherwise be indistinguishable.
    const grid = within(screen.getByRole('table'));
    expect(grid.getByText('15 Sep')).toBeTruthy();
  });

  it('gives the class column header a spoken name carrying the full date', () => {
    render(<RegisterGrid data={DATA} classHref={(id) => `/teacher/attendance/${id}`} />);
    // The old header had no aria-label at all, so its accessible name came from
    // visible text in DOM order ("15" then "Tue"), never "Tue 15 Sep".
    const header = screen.getByRole('link', { name: 'Tue 15 Sep' });
    expect(header.getAttribute('href')).toBe('/teacher/attendance/class-1');
  });

  it('shows each attendance percentage', () => {
    render(<RegisterGrid data={DATA} classHref={(id) => `/teacher/attendance/${id}`} />);
    expect(screen.getAllByText('100%').length).toBe(2);
    expect(screen.getByText('0%')).toBeTruthy();
  });

  it('explains how many paused students are hidden', () => {
    render(<RegisterGrid data={DATA} classHref={(id) => `/teacher/attendance/${id}`} />);
    expect(screen.getByText(/2 paused/i)).toBeTruthy();
  });

  it('keeps every group letter at 4.5:1 or better against its own tinted background, on the real Neram theme', () => {
    // The real app theme, not the MUI default a bare render falls back to:
    // round 1's test proved a token swap without proving the actual shipped
    // colour cleared 4.5:1, which is exactly how it missed that `warning.dark`
    // is only about 3.79:1 with this app's real tokens. This one uses
    // `nexusLightTheme` itself and does the WCAG maths off what actually
    // renders, so it cannot be satisfied by a plausible-looking token alone.
    render(
      <NeramThemeProvider theme={nexusLightTheme}>
        <RegisterGrid data={DATA} classHref={(id) => `/teacher/attendance/${id}`} />
      </NeramThemeProvider>,
    );

    const grid = within(screen.getByRole('table'));
    // The grid's own explicit paper surface, read off its wrapper rather than
    // assumed, so a future change to `background.paper` moves this test's
    // backdrop the same way it would move the real page.
    const paperEl = screen.getByRole('table').parentElement as HTMLElement;
    const paper = parseRgb(getComputedStyle(paperEl).backgroundColor);

    const ratios: Record<string, number> = {};
    for (const letter of TONE_LETTERS) {
      const cell = grid.getByText(letter);
      const styles = getComputedStyle(cell);
      const ink = parseRgb(styles.color);
      const cellBg = flatten(parseRgb(styles.backgroundColor), paper);
      ratios[letter] = contrastRatio(ink, cellBg);
    }

    for (const letter of TONE_LETTERS) {
      expect(ratios[letter]).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the legend swatches visually identical to the cells they explain', () => {
    render(
      <NeramThemeProvider theme={nexusLightTheme}>
        <RegisterGrid data={DATA} classHref={(id) => `/teacher/attendance/${id}`} />
      </NeramThemeProvider>,
    );

    const grid = within(screen.getByRole('table'));
    for (const letter of TONE_LETTERS) {
      const cell = grid.getByText(letter);
      // With one class column, every other occurrence of the same bare letter
      // is the legend's own swatch for that group.
      const legendSwatch = screen.getAllByText(letter).find((el) => el !== cell);
      expect(legendSwatch).toBeTruthy();
      const cellStyles = getComputedStyle(cell);
      const legendStyles = getComputedStyle(legendSwatch as HTMLElement);
      expect(legendStyles.color).toBe(cellStyles.color);
      expect(legendStyles.backgroundColor).toBe(cellStyles.backgroundColor);
    }
  });

  it('says the classroom is empty instead of a header row over nothing', () => {
    const emptyData: RegisterResponse = { ...DATA, students: [], cells: {} };
    render(<RegisterGrid data={emptyData} classHref={(id) => `/teacher/attendance/${id}`} />);
    expect(screen.getByText('No students in this classroom yet.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBe(null);
  });

  it('tells a teacher nobody matches, distinct from an empty classroom, when a search filters out every row', () => {
    render(<RegisterGrid data={DATA} classHref={(id) => `/teacher/attendance/${id}`} />);
    fireEvent.change(screen.getByLabelText(/Find a student/i), { target: { value: 'Zzzzz no such name' } });
    expect(screen.getByText('Nobody matches this filter.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBe(null);
  });

  it('draws an unmeasured class as a column of "?", not a column of X, and says why', () => {
    // Finding 1: a class the register endpoint has not written any cells for
    // (Teams attendance never read) must read as unknown, not as a class where
    // everyone missed. No cell in data.cells for this class is the fixture
    // that matches what route.ts now actually sends for one.
    const unmeasured: RegisterResponse = {
      ...DATA,
      classes: [
        {
          id: 'class-unsynced',
          title: 'Never Read From Teams',
          scheduled_date: '2026-09-16',
          start_time: '19:00:00',
          end_time: '20:30:00',
          held: null,
          measured: false,
          sync_status: null,
          counts: { whole: 0, partly: 0, reason: 0, noReason: 0, joinedLater: 0 },
        },
      ],
      cells: { 'class-unsynced': {} },
    };
    render(<RegisterGrid data={unmeasured} classHref={(id) => `/teacher/attendance/${id}`} />);

    const grid = within(screen.getByRole('table'));
    // Every one of the four students gets the "?" glyph, never the "missed,
    // no reason" X a defaulted `attended: false` used to produce.
    expect(grid.getAllByText('?').length).toBe(DATA.students.length);
    expect(grid.queryByText('X')).toBe(null);
    expect(
      screen.getByLabelText(/Student A, Wed 16 Sep: attendance not read from Teams yet/i),
    ).toBeTruthy();
  });

  it('gives a batch-excluded student different wording than an unmeasured class, for the same blank cell', () => {
    // Finding 1's wording half: a measured class can still have no cell for
    // one student because a batch-scoped class was never about them. That is
    // a different fact from "Teams has not been read yet" and must not share
    // its sentence.
    const batchScoped: RegisterResponse = {
      ...DATA,
      classes: [
        {
          id: 'class-batch',
          title: 'Batch Only Session',
          scheduled_date: '2026-09-14',
          start_time: '19:00:00',
          end_time: '20:30:00',
          held: { start: '2026-09-14T13:30:00.000Z', end: '2026-09-14T14:40:00.000Z', source: 'observed', minutes: 70 },
          measured: true,
          sync_status: 'ok',
          counts: { whole: 1, partly: 0, reason: 0, noReason: 0, joinedLater: 0 },
        },
      ],
      // Only s1 (Student A) belongs to this class's batch; s2-s4 get no cell
      // even though the class itself was measured.
      cells: { 'class-batch': { s1: { g: 'whole', min: 70 } } },
    };
    render(<RegisterGrid data={batchScoped} classHref={(id) => `/teacher/attendance/${id}`} />);

    expect(
      screen.getByLabelText(/Student B, Mon 14 Sep: not part of this class/i),
    ).toBeTruthy();
    expect(screen.queryByLabelText(/Student B, Mon 14 Sep: attendance not read from Teams yet/i)).toBe(null);
  });
});
