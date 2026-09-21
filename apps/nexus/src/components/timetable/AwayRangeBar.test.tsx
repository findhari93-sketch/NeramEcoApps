import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AwayRangeBar from './AwayRangeBar';

const RANGE = { rangeStart: '2026-09-01', rangeEnd: '2026-09-30' };
const bar = (c: HTMLElement) => c.querySelector('[data-away-bar]') as HTMLElement;

describe('AwayRangeBar', () => {
  it('places a window inside the range where it actually falls', () => {
    const { container } = render(
      <AwayRangeBar {...RANGE} startsOn="2026-09-16" endsOn="2026-09-20" />,
    );
    // Day 15 of 30 in, 5 days wide.
    expect(bar(container).style.left.startsWith('50')).toBe(true);
    expect(bar(container).style.width.startsWith('16.6')).toBe(true);
  });

  it('clamps a window that began before the range to the left edge', () => {
    const { container } = render(
      <AwayRangeBar {...RANGE} startsOn="2026-08-10" endsOn="2026-09-05" />,
    );
    expect(bar(container).style.left).toBe('0%');
  });

  it('runs an open ended window to the right edge instead of inventing a return date', () => {
    const { container } = render(<AwayRangeBar {...RANGE} startsOn="2026-09-16" endsOn={null} />);
    const el = bar(container);
    expect(el.style.left.startsWith('50')).toBe(true);
    expect(el.style.width.startsWith('50')).toBe(true);
    expect(el.getAttribute('data-open-ended')).toBe('1');
  });

  it('clamps a window that outlasts the range to the right edge', () => {
    const { container } = render(
      <AwayRangeBar {...RANGE} startsOn="2026-09-16" endsOn="2026-11-02" />,
    );
    expect(Number.parseFloat(bar(container).style.width)).toBeCloseTo(50, 0);
  });

  it('keeps a one day window visible inside a whole month', () => {
    const { container } = render(
      <AwayRangeBar {...RANGE} startsOn="2026-09-16" endsOn="2026-09-16" />,
    );
    expect(Number.parseFloat(bar(container).style.width)).toBeGreaterThanOrEqual(2);
  });

  it('says what it is drawing, for a reader who cannot see the bar', () => {
    render(<AwayRangeBar {...RANGE} startsOn="2026-09-16" endsOn={null} />);
    expect(screen.getByLabelText('Away from 16 Sep, no return date yet')).toBeTruthy();
    render(<AwayRangeBar {...RANGE} startsOn="2026-09-16" endsOn="2026-09-20" />);
    expect(screen.getByLabelText('Away 16 Sep to 20 Sep')).toBeTruthy();
  });
});
