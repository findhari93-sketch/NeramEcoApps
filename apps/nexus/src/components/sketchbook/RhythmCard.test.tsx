import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RhythmCard from './RhythmCard';
import type { Rhythm } from '@/lib/sketchbook-rhythm';

const base: Rhythm = {
  today: '2026-09-09',
  week: { start: '2026-09-07', days: [true, false, true, false, false, false, false], count: 2, goal: 3, met: false },
  lastWeek: { start: '2026-08-31', days: [false, false, false, false, false, false, true], count: 1, goal: 3, met: false },
  run: 0, bestRun: 4, totalDays: 12, lastPracticeDate: '2026-09-09', quietDays: 0,
};

describe('RhythmCard', () => {
  it('names the week, the goal and the best run', () => {
    render(<RhythmCard rhythm={base} />);
    expect(screen.getByText('2 of 3 days this week.')).toBeTruthy();
    expect(screen.getByText('Best run 4 weeks. 12 practice days in all.')).toBeTruthy();
  });
  it('dates the week, so Monday to Sunday is never a guess (NXS-0129)', () => {
    render(<RhythmCard rhythm={base} />);
    expect(screen.getByText('7 to 13 Sep')).toBeTruthy();
  });
  it('keeps last week visible after Monday (NXS-0129)', () => {
    render(<RhythmCard rhythm={base} />);
    expect(screen.getByText('Last week: 1 of 3 days.')).toBeTruthy();
  });
  it('has no last-week line when last week was not tracked', () => {
    render(<RhythmCard rhythm={{ ...base, lastWeek: null }} />);
    expect(screen.queryByText(/Last week/)).toBeNull();
  });
  it("rings the server's today, the student's own clock", () => {
    const { container } = render(<RhythmCard rhythm={base} />);
    const cells = container.querySelectorAll('[role="img"]');
    const ringed = Array.from(cells).map((c) => getComputedStyle(c).borderColor !== 'transparent');
    expect(ringed.indexOf(true)).toBe(2); // Wednesday 9 Sep
  });
  it('renders seven day cells with accessible names', () => {
    render(<RhythmCard rhythm={base} />);
    const cells = screen.getAllByRole('img');
    expect(cells.length).toBe(7);
    expect(cells[0].getAttribute('aria-label')).toBe('Monday, practised');
    expect(cells[1].getAttribute('aria-label')).toBe('Tuesday, no sketch');
  });
  it('invites a new student', () => {
    render(<RhythmCard rhythm={{ ...base, totalDays: 0, week: { ...base.week, days: Array(7).fill(false), count: 0 } }} />);
    expect(screen.getByText('Start your rhythm. 3 practice days a week is the goal.')).toBeTruthy();
    expect(screen.queryByText(/Last week/)).toBeNull();
  });
});
