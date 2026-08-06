import { describe, it, expect } from 'vitest';
import {
  formatClock,
  formatSpoken,
  clamp,
  ratioFromClientX,
  mergeRanges,
  rangesDiffer,
} from './format';

describe('formatClock', () => {
  it('shows hours once a video is long enough to have them', () => {
    // The bug this replaces: the old private fmt only ever emitted m:ss, so a
    // 90 minute class read as "90:00".
    expect(formatClock(90 * 60)).toBe('1:30:00');
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(7625)).toBe('2:07:05');
  });

  it('leaves hours off when there are none', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(5)).toBe('0:05');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(3599)).toBe('59:59');
  });

  it('treats an unknown duration as zero rather than NaN:NaN', () => {
    expect(formatClock(Number.NaN)).toBe('0:00');
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe('0:00');
    expect(formatClock(-4)).toBe('0:00');
  });
});

describe('formatSpoken', () => {
  it('reads as a duration rather than as punctuation', () => {
    expect(formatSpoken(7625)).toBe('2 hours 7 minutes 5 seconds');
    expect(formatSpoken(65)).toBe('1 minute 5 seconds');
  });

  it('drops a zero seconds tail but keeps a bare zero', () => {
    expect(formatSpoken(3600)).toBe('1 hour');
    expect(formatSpoken(120)).toBe('2 minutes');
    expect(formatSpoken(0)).toBe('0 seconds');
  });
});

describe('clamp', () => {
  it('holds the bounds', () => {
    expect(clamp(500, 0, 120)).toBe(120);
    expect(clamp(-5, 0, 120)).toBe(0);
    expect(clamp(60, 0, 120)).toBe(60);
  });

  it('falls to the minimum on a value that is not a number', () => {
    expect(clamp(Number.NaN, 0, 120)).toBe(0);
  });

  it('does not invert when the bounds are crossed', () => {
    // Happens for one render when a duration arrives before a ceiling does.
    expect(clamp(50, 100, 10)).toBe(100);
  });
});

describe('ratioFromClientX', () => {
  it('maps a pointer onto the track', () => {
    expect(ratioFromClientX(300, { left: 0, width: 600 })).toBe(0.5);
    expect(ratioFromClientX(140, { left: 40, width: 200 })).toBe(0.5);
  });

  it('clamps a pointer that has been dragged off either end', () => {
    expect(ratioFromClientX(-90, { left: 0, width: 600 })).toBe(0);
    expect(ratioFromClientX(9000, { left: 0, width: 600 })).toBe(1);
  });

  it('does not divide by a zero width', () => {
    expect(ratioFromClientX(10, { left: 0, width: 0 })).toBe(0);
  });
});

describe('mergeRanges', () => {
  it('joins touching and overlapping ranges so the bar has no seams', () => {
    expect(mergeRanges([[0, 10], [10, 20]])).toEqual([[0, 20]]);
    expect(mergeRanges([[0, 12], [8, 20]])).toEqual([[0, 20]]);
  });

  it('keeps a genuine gap', () => {
    expect(mergeRanges([[0, 10], [30, 40]])).toEqual([[0, 10], [30, 40]]);
  });

  it('sorts before merging, because buffered order is not guaranteed', () => {
    expect(mergeRanges([[30, 40], [0, 10], [9, 12]])).toEqual([[0, 12], [30, 40]]);
  });

  it('drops empty and non-finite ranges', () => {
    expect(mergeRanges([[5, 5], [0, Number.NaN], [10, 20]])).toEqual([[10, 20]]);
  });
});

describe('rangesDiffer', () => {
  it('ignores the sub-second drift of an ordinary tick', () => {
    expect(rangesDiffer([[0, 30]], [[0, 30.2]])).toBe(false);
  });

  it('notices real growth and a change of shape', () => {
    expect(rangesDiffer([[0, 30]], [[0, 45]])).toBe(true);
    expect(rangesDiffer([[0, 30]], [[0, 30], [60, 70]])).toBe(true);
  });
});
