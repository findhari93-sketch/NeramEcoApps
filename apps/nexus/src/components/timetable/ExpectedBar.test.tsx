import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ExpectedBar from './ExpectedBar';
import type { RsvpSummary } from '@/app/api/timetable/rsvp-dashboard/route';

const summary = (over: Partial<RsvpSummary> = {}): RsvpSummary => ({
  attending: 18,
  not_attending: 4,
  total: 22,
  on_roll: 28,
  away: 6,
  ...over,
});

describe('ExpectedBar', () => {
  it('draws the away block, which is the one the teacher opened it for', () => {
    const { container } = render(<ExpectedBar summary={summary()} />);
    expect(container.querySelector('[data-segment="away"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-segment]').length).toBe(3);
  });

  it('measures against the roll, not the expected, or the away block vanishes', () => {
    const { container } = render(<ExpectedBar summary={summary()} />);
    const away = container.querySelector('[data-segment="away"]') as HTMLElement;
    // 6 of 28, not 6 of 22.
    expect(away.style.width.startsWith('21.4')).toBe(true);
  });

  it('carries the whole sentence for a screen reader', () => {
    render(<ExpectedBar summary={summary()} />);
    expect(screen.getByLabelText('18 of 22 expected, 6 away, 4 stepped out')).toBeTruthy();
  });

  it('draws an empty track rather than dividing by zero', () => {
    const { container } = render(
      <ExpectedBar summary={summary({ attending: 0, not_attending: 0, total: 0, on_roll: 0, away: 0 })} />,
    );
    expect(container.querySelectorAll('[data-segment]').length).toBe(0);
  });
});
