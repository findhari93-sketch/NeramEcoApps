// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { scheduleFromRules, readNotStartedSchedule, DEFAULT_NOT_STARTED_SCHEDULE } from './lifecycle-schedule';
import { joinReminderDue, needsDecision, normalizeReminderSchedule, waitPeriodLabel, dormantViewCounts } from './not-started';

const NOW = Date.parse('2026-09-26T06:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const notStarted = (since: string) => ({ participation_status: 'dormant', dormant_source: 'auto', dormant_since: since });

describe('scheduleFromRules', () => {
  it('uses the configured days, sorted, at most three', () => {
    expect(scheduleFromRules({ join_reminder_days: [10, 2, 5, 20], not_started_decision_days: 21 })).toEqual({
      joinReminderDays: [2, 5, 10],
      decisionDays: 21,
    });
  });

  it('falls back to the defaults for missing or bad values', () => {
    expect(scheduleFromRules(null)).toEqual(DEFAULT_NOT_STARTED_SCHEDULE);
    expect(scheduleFromRules({ join_reminder_days: 'x', not_started_decision_days: 0 })).toEqual(DEFAULT_NOT_STARTED_SCHEDULE);
    expect(scheduleFromRules({ join_reminder_days: [], not_started_decision_days: 500 })).toEqual(DEFAULT_NOT_STARTED_SCHEDULE);
  });

  it('never throws when the settings read fails', async () => {
    const broken = { from: () => { throw new Error('boom'); } };
    await expect(readNotStartedSchedule(broken)).resolves.toEqual(DEFAULT_NOT_STARTED_SCHEDULE);
    const missing = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'no table' } }) }) }) }),
    };
    await expect(readNotStartedSchedule(missing)).resolves.toEqual(DEFAULT_NOT_STARTED_SCHEDULE);
  });
});

describe('configurable not-started rules', () => {
  it('joinReminderDue follows a configured schedule and keeps the default', () => {
    expect(joinReminderDue(daysAgo(2), 0, NOW, [2, 4, 8])).toBe(1);
    expect(joinReminderDue(daysAgo(3), 1, NOW, [2, 4, 8])).toBeNull();
    expect(joinReminderDue(daysAgo(4), 1, NOW, [2, 4, 8])).toBe(2);
    expect(joinReminderDue(daysAgo(3), 1, NOW)).toBe(2);
    expect(normalizeReminderSchedule([0, -1, 2.5])).toEqual([1, 3, 7]);
  });

  it('needsDecision and the dormant counts use the configured decision point', () => {
    const row = notStarted(daysAgo(10));
    expect(needsDecision(row, NOW)).toBe(false);
    expect(needsDecision(row, NOW, 7)).toBe(true);
    expect(dormantViewCounts([row], NOW, 7).not_started_long).toBe(1);
    expect(dormantViewCounts([row], NOW).not_started_long).toBe(0);
  });

  it('words the wait period naturally', () => {
    expect(waitPeriodLabel(14)).toBe('2 weeks');
    expect(waitPeriodLabel(7)).toBe('1 week');
    expect(waitPeriodLabel(10)).toBe('10 days');
  });
});
