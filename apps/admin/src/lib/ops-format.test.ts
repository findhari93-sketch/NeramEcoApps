// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  istDayNumber,
  formatIstTime,
  formatIstDate,
  formatIstDateTime,
  formatMonthKey,
  describeDue,
  daysAgo,
  agoText,
  signInMethods,
  isTypedConfirmation,
  pickParam,
  sumCounts,
  humanizeKey,
  validateRulesForm,
  addReminderDay,
  mapRuleServerErrors,
  type RulesFormValues,
} from './ops-format';

// 2026-09-26 10:00 in India = 04:30 UTC.
const NOW = new Date('2026-09-26T04:30:00Z');

describe('India time formatting', () => {
  it('shifts UTC to India time, across midnight', () => {
    // 20:00 UTC on the 25th is 01:30 on the 26th in India.
    expect(formatIstDateTime('2026-09-25T20:00:00Z')).toBe('26 Sep 2026, 1:30 am');
    expect(formatIstTime('2026-09-26T06:30:00Z')).toBe('12:00 pm');
    expect(formatIstTime('2026-09-25T18:30:00Z')).toBe('12:00 am');
    expect(formatIstDate('2026-01-01T00:00:00Z')).toBe('1 Jan 2026');
  });

  it('returns empty text for missing or bad values', () => {
    expect(formatIstDate(null)).toBe('');
    expect(formatIstDateTime('not a date')).toBe('');
    expect(Number.isNaN(istDayNumber('nope'))).toBe(true);
  });

  it('reads a month key without a time zone shift', () => {
    expect(formatMonthKey('2026-09-01')).toBe('Sep 2026');
    expect(formatMonthKey('2025-12-01T00:00:00')).toBe('Dec 2025');
    expect(formatMonthKey('')).toBe('');
  });
});

describe('describeDue', () => {
  it('is overdue only when due on an earlier India day', () => {
    // 23:00 India on the 25th.
    expect(describeDue('2026-09-25T17:30:00Z', NOW)).toEqual({ tone: 'overdue', text: 'Overdue by 1 day (25 Sep 2026)' });
    expect(describeDue('2026-09-20T05:00:00Z', NOW).text).toBe('Overdue by 6 days (20 Sep 2026)');
  });

  it('keeps an earlier time today as Today, not overdue', () => {
    // 07:00 India today, now is 10:00.
    expect(describeDue('2026-09-26T01:30:00Z', NOW)).toEqual({ tone: 'today', text: 'Today, 7:00 am' });
  });

  it('treats 00:30 India tomorrow as tomorrow even though it is still the 26th in UTC', () => {
    expect(describeDue('2026-09-26T19:00:00Z', NOW)).toEqual({ tone: 'upcoming', text: 'Tomorrow, 12:30 am' });
  });

  it('names the weekday for later days and the year only when it differs', () => {
    expect(describeDue('2026-09-29T09:30:00Z', NOW).text).toBe('Tue 29 Sep, 3:00 pm');
    expect(describeDue('2027-01-05T04:30:00Z', NOW).text).toBe('Tue 5 Jan 2027, 10:00 am');
  });

  it('handles a missing due time', () => {
    expect(describeDue(null, NOW)).toEqual({ tone: 'upcoming', text: 'No due time' });
  });
});

describe('daysAgo and agoText', () => {
  it('counts India calendar days', () => {
    expect(daysAgo('2026-09-26T00:00:00Z', NOW)).toBe(0);
    expect(agoText('2026-09-25T10:00:00Z', NOW)).toBe('yesterday');
    expect(agoText('2026-09-01T10:00:00Z', NOW)).toBe('25 days ago');
    expect(daysAgo(null, NOW)).toBeNull();
    expect(agoText(undefined, NOW)).toBe('');
  });
});

describe('signInMethods', () => {
  it('derives Google, Microsoft and phone from the identity columns', () => {
    expect(signInMethods({ firebase_uid: 'abc', ms_oid: 'oid-1', phone: '+91 99494 14949' })).toEqual([
      'google',
      'microsoft',
      'phone',
    ]);
  });

  it('ignores blanks, parent portal ids and short phone values', () => {
    expect(signInMethods({ firebase_uid: ' ', ms_oid: 'parent:123', phone: '12345' })).toEqual([]);
    expect(signInMethods({ ms_oid: 'oid-2' })).toEqual(['microsoft']);
    expect(signInMethods(null)).toEqual([]);
  });
});

describe('isTypedConfirmation', () => {
  it('accepts the word in any case with outer spaces', () => {
    expect(isTypedConfirmation('MERGE')).toBe(true);
    expect(isTypedConfirmation('  merge ')).toBe(true);
  });
  it('refuses anything else', () => {
    expect(isTypedConfirmation('MERG')).toBe(false);
    expect(isTypedConfirmation('MERGE NOW')).toBe(false);
    expect(isTypedConfirmation('')).toBe(false);
    expect(isTypedConfirmation(null)).toBe(false);
  });
});

describe('small helpers', () => {
  it('pickParam falls back for unknown values', () => {
    const tabs = ['open', 'merged', 'dismissed'] as const;
    expect(pickParam('merged', tabs, 'open')).toBe('merged');
    expect(pickParam('bogus', tabs, 'open')).toBe('open');
    expect(pickParam(null, tabs, 'open')).toBe('open');
  });

  it('sumCounts ignores missing values', () => {
    expect(sumCounts({ a: 2, b: 3, c: undefined, d: null })).toBe(5);
    expect(sumCounts(null)).toBe(0);
  });

  it('humanizeKey turns a table name into words', () => {
    expect(humanizeKey('nexus_enrollments')).toBe('Nexus enrollments');
    expect(humanizeKey(null)).toBe('');
  });
});

describe('lifecycle rules form', () => {
  const valid: RulesFormValues = {
    student_quiet_days: '21',
    lead_archive_days: '180',
    archived_deactivate_days: '365',
    not_started_decision_days: '14',
    suggest_graduation: true,
    join_reminder_days: [1, 3, 7],
  };

  it('accepts the defaults', () => {
    expect(validateRulesForm(valid)).toEqual({});
  });

  it('flags empty, fractional and out of range values per field', () => {
    const errors = validateRulesForm({ ...valid, student_quiet_days: '', lead_archive_days: '12.5', not_started_decision_days: '61' });
    expect(errors.student_quiet_days).toBe('Enter a number of days.');
    expect(errors.lead_archive_days).toBe('Use whole days, for example 30.');
    expect(errors.not_started_decision_days).toBe('Use a number from 3 to 60.');
  });

  it('requires turning off sign-in to come after archiving', () => {
    expect(validateRulesForm({ ...valid, lead_archive_days: '400', archived_deactivate_days: '365' }).archived_deactivate_days).toBe(
      'Must be longer than the archive rule.',
    );
  });

  it('requires one to five reminder days', () => {
    expect(validateRulesForm({ ...valid, join_reminder_days: [] }).join_reminder_days).toBeDefined();
    expect(validateRulesForm({ ...valid, join_reminder_days: [1, 2, 3, 4, 5, 6] }).join_reminder_days).toBeDefined();
  });

  it('addReminderDay parses, sorts and refuses duplicates or bad input', () => {
    expect(addReminderDay([1, 7], '3')).toEqual({ days: [1, 3, 7] });
    expect(addReminderDay([1, 7], '7').error).toBe('Day 7 is already in the list.');
    expect(addReminderDay([1], '31').error).toBe('Use a day from 1 to 30.');
    expect(addReminderDay([1], 'x').error).toBe('Use a whole number of days.');
    expect(addReminderDay([1, 2, 3, 4, 5], '6').error).toBe('Use at most 5 reminder days.');
  });

  it('maps server messages to fields', () => {
    const out = mapRuleServerErrors(
      'student_quiet_days must be a whole number from 7 to 120. Turning off sign-in must come later than archiving. Something else broke.',
    );
    expect(out.student_quiet_days).toBe('This must be a whole number from 7 to 120.');
    expect(out.archived_deactivate_days).toBe('Must be longer than the archive rule.');
    expect(out.form).toBe('Something else broke.');
    expect(mapRuleServerErrors(null)).toEqual({});
  });
});
