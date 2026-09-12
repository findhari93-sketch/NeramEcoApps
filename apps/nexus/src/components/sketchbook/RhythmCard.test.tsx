import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RhythmCard from './RhythmCard';
import type { Rhythm } from '@/lib/sketchbook-rhythm';

const base: Rhythm = {
  week: { start: '2026-09-07', days: [true, false, true, false, false, false, false], count: 2, goal: 3, met: false },
  run: 0, bestRun: 4, totalDays: 12, lastPracticeDate: '2026-09-09', quietDays: 0,
};

describe('RhythmCard', () => {
  it('names the week, the goal and the best run', () => {
    render(<RhythmCard rhythm={base} />);
    expect(screen.getByText('2 of 3 days this week.')).toBeTruthy();
    expect(screen.getByText('Best run 4 weeks. 12 practice days in all.')).toBeTruthy();
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
  });
});
