import { describe, it, expect } from 'vitest';
import {
  DEFAULT_REOPEN_PRESET,
  MAX_REOPEN_DAYS,
  endOfIstDay,
  formatReopenUntil,
  istDatePlusDays,
  presetDate,
  reopenUntilProblem,
} from './reopen-deadline';

/**
 * A reopen closes at the end of an IST day the teacher picks. The founder asked
 * for days, not times: "till tomorrow, one day or two days".
 */

// 11 Sept, 8:00 PM UTC, which is already 12 Sept, 1:30 AM in India.
const LATE_NIGHT_UTC = Date.parse('2026-09-11T20:00:00Z');

describe('reopen deadlines', () => {
  it('counts days on the IST calendar, not the UTC one', () => {
    expect(istDatePlusDays(0, LATE_NIGHT_UTC)).toBe('2026-09-12');
    expect(istDatePlusDays(3, LATE_NIGHT_UTC)).toBe('2026-09-15');
  });

  it('defaults to three days', () => {
    expect(DEFAULT_REOPEN_PRESET).toBe('3d');
    expect(presetDate('3d', Date.parse('2026-09-11T06:00:00Z'))).toBe('2026-09-14');
    expect(presetDate('tomorrow', Date.parse('2026-09-11T06:00:00Z'))).toBe('2026-09-12');
  });

  it('closes at 11:59 PM India time on the chosen day', () => {
    expect(endOfIstDay('2026-09-14')).toBe('2026-09-14T18:29:59.000Z');
  });

  it('reads as a day and a time, with one comma', () => {
    expect(formatReopenUntil(endOfIstDay('2026-09-14'))).toMatch(/^Mon 14 Sept?, 11:59 PM$/);
  });

  it('refuses a date that has passed, or one too far out', () => {
    const now = Date.parse('2026-09-11T06:00:00Z');
    expect(reopenUntilProblem('2026-09-10T18:29:59Z', now)).toMatch(/has not passed/);
    expect(reopenUntilProblem(new Date(now + (MAX_REOPEN_DAYS + 1) * 86_400_000).toISOString(), now)).toMatch(
      /within 31 days/,
    );
    expect(reopenUntilProblem(null, now)).toMatch(/Pick when/);
    expect(reopenUntilProblem(endOfIstDay('2026-09-14'), now)).toBeNull();
  });
});
