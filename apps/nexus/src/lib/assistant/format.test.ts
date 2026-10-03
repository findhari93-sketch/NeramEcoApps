import { describe, expect, it } from 'vitest';
import { formatTime12, relativeDay } from './format';

describe('formatTime12', () => {
  it('turns 24h into 12h with am/pm', () => {
    expect(formatTime12('18:00')).toBe('6:00 pm');
    expect(formatTime12('09:05:00')).toBe('9:05 am');
    expect(formatTime12('00:30')).toBe('12:30 am');
    expect(formatTime12('12:00')).toBe('12:00 pm');
  });
  it('returns the input when it is not a time', () => {
    expect(formatTime12('soon')).toBe('soon');
  });
});

describe('relativeDay', () => {
  const today = '2026-10-03';
  it('names today and tomorrow', () => {
    expect(relativeDay('2026-10-03', today)).toBe('today');
    expect(relativeDay('2026-10-04', today)).toBe('tomorrow');
  });
  it('names a weekday inside the week, then a date', () => {
    expect(relativeDay('2026-10-06', today)).toBe('Tuesday 6 Oct');
    expect(relativeDay('2026-10-20', today)).toBe('20 Oct');
  });
  it('says yesterday for the day before', () => {
    expect(relativeDay('2026-10-02', today)).toBe('yesterday');
  });
});
