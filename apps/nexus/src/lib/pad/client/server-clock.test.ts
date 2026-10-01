import { describe, expect, it } from 'vitest';
import { bestOffset, clockLabel, clockSample, secondsLeft } from './server-clock';

describe('server clock', () => {
  it('takes the largest sample, the one from the quickest response', () => {
    const t = Date.parse('2026-10-01T10:00:00.000Z');
    expect(clockSample('2026-10-01T10:00:00.000Z', t + 300)).toBe(-300);
    expect(bestOffset([-300, -40, -900])).toBe(-40);
    expect(bestOffset([])).toBe(0);
  });

  it('counts whole seconds down to the deadline, never below zero', () => {
    const now = Date.parse('2026-10-01T10:00:00.000Z');
    expect(secondsLeft('2026-10-01T10:00:42.000Z', now)).toBe(42);
    expect(secondsLeft('2026-10-01T10:00:41.200Z', now)).toBe(42);
    expect(secondsLeft('2026-10-01T09:59:00.000Z', now)).toBe(0);
    expect(secondsLeft(null, now)).toBeNull();
  });

  it('writes minutes and seconds', () => {
    expect(clockLabel(42)).toBe('0:42');
    expect(clockLabel(65)).toBe('1:05');
    expect(clockLabel(-3)).toBe('0:00');
  });
});
