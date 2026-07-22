import { describe, it, expect } from 'vitest';
import { remindedAgo } from './relative-time';

// A fixed reference "now" so the buckets are deterministic.
const NOW = new Date('2026-07-21T12:00:00.000Z').getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('remindedAgo', () => {
  it('shows "just now" under a minute', () => {
    expect(remindedAgo(ago(0), NOW)).toBe('just now');
    expect(remindedAgo(ago(59 * SEC), NOW)).toBe('just now');
  });

  it('shows minutes under an hour', () => {
    expect(remindedAgo(ago(1 * MIN), NOW)).toBe('1m ago');
    expect(remindedAgo(ago(45 * MIN), NOW)).toBe('45m ago');
    expect(remindedAgo(ago(59 * MIN), NOW)).toBe('59m ago');
  });

  it('shows hours under a day', () => {
    expect(remindedAgo(ago(1 * HOUR), NOW)).toBe('1h ago');
    expect(remindedAgo(ago(23 * HOUR), NOW)).toBe('23h ago');
  });

  it('shows days from a day onward', () => {
    expect(remindedAgo(ago(1 * DAY), NOW)).toBe('1d ago');
    expect(remindedAgo(ago(2 * DAY + 5 * HOUR), NOW)).toBe('2d ago');
    expect(remindedAgo(ago(10 * DAY), NOW)).toBe('10d ago');
  });

  it('crosses each boundary exactly', () => {
    expect(remindedAgo(ago(60 * SEC), NOW)).toBe('1m ago'); // 1 min -> minutes
    expect(remindedAgo(ago(60 * MIN), NOW)).toBe('1h ago'); // 60 min -> hours
    expect(remindedAgo(ago(24 * HOUR), NOW)).toBe('1d ago'); // 24 h -> days
  });
});
