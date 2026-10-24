import { describe, it, expect } from 'vitest';
import { isNewAccount, nextAutoRetryDelay, teamsRetryNote, TEAMS_AUTO_RETRY_DELAYS_MIN } from './auto-retry';

const NOW = Date.parse('2026-10-23T10:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

describe('class account Teams auto retry', () => {
  it('only retries an account made in the last hour', () => {
    expect(isNewAccount(minutesAgo(1), NOW)).toBe(true);
    expect(isNewAccount(minutesAgo(59), NOW)).toBe(true);
    expect(isNewAccount(minutesAgo(61), NOW)).toBe(false);
    // Adopted accounts have no creation time: never retried by the card.
    expect(isNewAccount(null, NOW)).toBe(false);
    expect(isNewAccount('not a date', NOW)).toBe(false);
  });

  it('waits 2, 3 and 5 minutes, then stops', () => {
    expect(nextAutoRetryDelay(0)).toBe(2 * 60_000);
    expect(nextAutoRetryDelay(1)).toBe(3 * 60_000);
    expect(nextAutoRetryDelay(2)).toBe(5 * 60_000);
    expect(nextAutoRetryDelay(TEAMS_AUTO_RETRY_DELAYS_MIN.length)).toBeNull();
  });

  it('says when the next try runs, in IST', () => {
    const autoAt = Date.parse('2026-10-23T11:02:00.000Z'); // 4:32 pm IST
    expect(teamsRetryNote({ autoAt, exhausted: false, signedIn: false, firstName: 'Janani' })).toBe(
      'Trying again automatically at 4:32 pm.',
    );
  });

  it('points to Nexus once the tries run out, until the student has signed in', () => {
    expect(teamsRetryNote({ autoAt: null, exhausted: true, signedIn: false, firstName: 'Janani' })).toBe(
      'Tried 3 times. Press Retry in a few minutes. It also finishes by itself when Janani first opens Nexus.',
    );
    expect(teamsRetryNote({ autoAt: null, exhausted: true, signedIn: true, firstName: 'Janani' })).toBe(
      'Tried 3 times. Press Retry in a few minutes.',
    );
    expect(teamsRetryNote({ autoAt: null, exhausted: false, signedIn: true, firstName: 'Janani' })).toBe('Press Retry in a few minutes.');
  });
});
