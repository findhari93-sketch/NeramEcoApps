import { describe, it, expect } from 'vitest';
import { parseTimecode, formatTimecode } from './timecode';

/**
 * A teacher reads a time off the video player, "15:24" or "1:02:38", and types
 * it back. The checkpoint editor used to ask for raw seconds instead, so every
 * boundary meant doing 15 x 60 + 24 in your head on a phone.
 */

describe('parseTimecode', () => {
  it('reads minutes and seconds', () => {
    expect(parseTimecode('15:24')).toBe(924);
    expect(parseTimecode('0:00')).toBe(0);
  });

  it('reads hours, minutes and seconds', () => {
    expect(parseTimecode('1:02:03')).toBe(3723);
  });

  it('accepts minutes past 59 when no hours are given, as a long video shows them', () => {
    expect(parseTimecode('62:03')).toBe(3723);
  });

  it('accepts plain seconds, so the old way of typing still works', () => {
    expect(parseTimecode('3723')).toBe(3723);
  });

  it('ignores surrounding spaces', () => {
    expect(parseTimecode('  15:24 ')).toBe(924);
  });

  it('accepts a single digit seconds part', () => {
    expect(parseTimecode('1:5')).toBe(65);
  });

  it('refuses anything that is not a time rather than guessing', () => {
    for (const bad of ['', '   ', 'abc', '-5', '1.5', '15:60', '1:60:00', '1:02:03:04', ':30', '12:', '1::2']) {
      expect(parseTimecode(bad)).toBeNull();
    }
  });
});

describe('formatTimecode', () => {
  it('writes m:ss under an hour', () => {
    expect(formatTimecode(924)).toBe('15:24');
    expect(formatTimecode(5)).toBe('0:05');
  });

  it('writes h:mm:ss from an hour', () => {
    expect(formatTimecode(3723)).toBe('1:02:03');
    expect(formatTimecode(3600)).toBe('1:00:00');
  });

  it('adds the hours when asked, so a column of times lines up', () => {
    expect(formatTimecode(924, { forceHours: true })).toBe('0:15:24');
  });

  it('rounds a fraction of a second', () => {
    expect(formatTimecode(59.6)).toBe('1:00');
  });

  it('treats nonsense as zero rather than printing NaN', () => {
    expect(formatTimecode(Number.NaN)).toBe('0:00');
    expect(formatTimecode(-1)).toBe('0:00');
    expect(formatTimecode(Number.POSITIVE_INFINITY)).toBe('0:00');
  });

  it('round trips through parseTimecode', () => {
    for (const seconds of [0, 59, 60, 924, 3599, 3600, 3758]) {
      expect(parseTimecode(formatTimecode(seconds))).toBe(seconds);
    }
  });
});
