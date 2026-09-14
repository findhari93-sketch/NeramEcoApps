import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  activityOf,
  dateWithYear,
  matchesFilters,
  parseStoredFilters,
  parseStoredSort,
  seenAgo,
  shortDate,
  sortStudents,
  statusLineOf,
  type RosterFilters,
  type RosterSort,
  type RosterStudent,
} from './student-roster-view';

const NOW = Date.UTC(2026, 8, 11, 6, 0, 0); // 11 Sep 2026, 11:30 IST
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();

function student(over: Partial<RosterStudent> = {}): RosterStudent {
  return {
    name: 'Student',
    ms_oid: 'oid',
    enrolled_at: iso(NOW - 30 * DAY),
    first_signed_in_at: iso(NOW - 20 * DAY),
    last_seen_at: iso(NOW - 2 * HOUR),
    attendance: { percentage: 80, total: 10 },
    possible_duplicate_of: null,
    has_application_form: true,
    ...over,
  };
}

describe('activityOf', () => {
  it('reads a missing Microsoft account before anything else', () => {
    expect(activityOf(student({ ms_oid: null }), NOW)).toBe('no_microsoft');
  });

  it('reads no sign-in at all as never signed in', () => {
    expect(activityOf(student({ first_signed_in_at: null, last_seen_at: null }), NOW)).toBe('never_signed_in');
  });

  it('reads a visit inside 14 days as active and an older one as inactive', () => {
    expect(activityOf(student({ last_seen_at: iso(NOW - 13 * DAY) }), NOW)).toBe('active');
    expect(activityOf(student({ last_seen_at: iso(NOW - 14 * DAY) }), NOW)).toBe('inactive');
  });

  it('falls back to the first sign-in when the last is missing', () => {
    expect(activityOf(student({ last_seen_at: null, first_signed_in_at: iso(NOW - 30 * DAY) }), NOW)).toBe('inactive');
  });
});

describe('matchesFilters', () => {
  const roster = [
    student({ name: 'Never', first_signed_in_at: null, last_seen_at: null }),
    student({ name: 'Stale', last_seen_at: iso(NOW - 20 * DAY) }),
    student({ name: 'Recent', last_seen_at: iso(NOW - 3 * DAY) }),
    student({ name: 'Last week', last_seen_at: iso(NOW - 9 * DAY) }),
    student({ name: 'Gmail', ms_oid: null, first_signed_in_at: null, last_seen_at: null }),
    student({ name: 'Twin', possible_duplicate_of: { id: 'x', name: 'Twin two' } }),
    student({ name: 'No form', has_application_form: false }),
  ];
  const names = (filters: Partial<RosterFilters>) =>
    roster.filter((s) => matchesFilters(s, { ...DEFAULT_FILTERS, ...filters }, NOW)).map((s) => s.name);

  it('keeps everyone with the default filters', () => {
    expect(names(DEFAULT_FILTERS)).toHaveLength(7);
  });

  it('narrows by sign-in activity', () => {
    expect(names({ signIn: 'never' })).toEqual(['Never']);
    expect(names({ signIn: 'inactive' })).toEqual(['Stale']);
    expect(names({ signIn: 'active_week' })).toEqual(['Recent', 'Twin', 'No form']);
  });

  it('narrows by account state', () => {
    expect(names({ account: 'no_microsoft' })).toEqual(['Gmail']);
    expect(names({ account: 'possible_duplicate' })).toEqual(['Twin']);
  });

  it('narrows by application form', () => {
    expect(names({ form: 'missing' })).toEqual(['No form']);
    expect(names({ form: 'linked' })).toHaveLength(6);
  });

  it('combines facets instead of letting the account filter end the check', () => {
    expect(names({ account: 'possible_duplicate', form: 'missing' })).toEqual([]);
  });

  it('never matches a form filter for a payload without the form check', () => {
    const old = student({ has_application_form: undefined });
    expect(matchesFilters(old, { ...DEFAULT_FILTERS, form: 'missing' }, NOW)).toBe(false);
    expect(matchesFilters(old, { ...DEFAULT_FILTERS, form: 'linked' }, NOW)).toBe(false);
  });
});

describe('sortStudents', () => {
  const asha = student({
    name: 'Asha',
    enrolled_at: iso(NOW - 5 * DAY),
    last_seen_at: iso(NOW - 1 * DAY),
    attendance: { percentage: 90, total: 10 },
  });
  const bala = student({
    name: 'Bala',
    enrolled_at: iso(NOW - 50 * DAY),
    first_signed_in_at: null,
    last_seen_at: null,
    attendance: { percentage: 40, total: 10 },
  });
  const chitra = student({
    name: 'Chitra',
    enrolled_at: null,
    last_seen_at: iso(NOW - 9 * DAY),
    attendance: { percentage: 40, total: 10 },
  });
  const order = (sort: RosterSort) => sortStudents([chitra, bala, asha], sort).map((s) => s.name);

  it('orders by name', () => {
    expect(order('name')).toEqual(['Asha', 'Bala', 'Chitra']);
  });

  it('puts the newest join first and unknown dates last', () => {
    expect(order('joined_newest')).toEqual(['Asha', 'Bala', 'Chitra']);
  });

  it('puts the oldest join first and unknown dates last', () => {
    expect(order('joined_oldest')).toEqual(['Bala', 'Asha', 'Chitra']);
  });

  it('puts the most recent visit first and never seen last', () => {
    expect(order('seen_recent')).toEqual(['Asha', 'Chitra', 'Bala']);
  });

  it('puts never seen first when looking for the longest unseen', () => {
    expect(order('seen_longest')).toEqual(['Bala', 'Chitra', 'Asha']);
  });

  it('puts the lowest attendance first and breaks ties by name', () => {
    expect(order('attendance_low')).toEqual(['Bala', 'Chitra', 'Asha']);
  });

  it('never mutates the input', () => {
    const input = [chitra, bala, asha];
    sortStudents(input, 'name');
    expect(input.map((s) => s.name)).toEqual(['Chitra', 'Bala', 'Asha']);
  });
});

describe('seenAgo and shortDate', () => {
  it('speaks the way a person would', () => {
    expect(seenAgo(iso(NOW - 20 * 1000), NOW)).toBe('just now');
    expect(seenAgo(iso(NOW - 5 * 60 * 1000), NOW)).toBe('5 min ago');
    expect(seenAgo(iso(NOW - 3 * HOUR), NOW)).toBe('3h ago');
    expect(seenAgo(iso(NOW - 30 * HOUR), NOW)).toBe('yesterday');
    expect(seenAgo(iso(NOW - 12 * DAY), NOW)).toBe('12 days ago');
    expect(seenAgo('2026-07-03T06:00:00Z', NOW)).toBe('on 3 Jul');
    expect(seenAgo(null, NOW)).toBeNull();
  });

  it('adds the year only when it differs, in Indian time', () => {
    expect(shortDate('2026-08-18T13:46:23Z', NOW)).toBe('18 Aug');
    expect(shortDate('2025-12-31T10:00:00Z', NOW)).toBe('31 Dec 2025');
    // 20:00 UTC on 31 Aug is already 1 Sep in India.
    expect(shortDate('2026-08-31T20:00:00Z', NOW)).toBe('1 Sep');
    expect(shortDate('not a date', NOW)).toBeNull();
  });
});

describe('dateWithYear', () => {
  it('always carries the year, unlike shortDate', () => {
    expect(dateWithYear('2026-08-18T13:46:23Z')).toBe('18 Aug 2026');
    expect(dateWithYear('2025-12-31T10:00:00Z')).toBe('31 Dec 2025');
    // 20:00 UTC on 31 Aug is already 1 Sep in India.
    expect(dateWithYear('2026-08-31T20:00:00Z')).toBe('1 Sep 2026');
  });

  it('says nothing about a missing or unreadable date', () => {
    expect(dateWithYear(null)).toBeNull();
    expect(dateWithYear(undefined)).toBeNull();
    expect(dateWithYear('not a date')).toBeNull();
  });

  // The two must stay apart: seenAgo and the application sheet rely on shortDate
  // staying short in the current year.
  it('leaves shortDate alone', () => {
    expect(shortDate('2026-08-18T13:46:23Z', NOW)).toBe('18 Aug');
    expect(seenAgo('2026-07-03T06:00:00Z', NOW)).toBe('on 3 Jul');
  });
});

describe('statusLineOf', () => {
  it('names the join date and the sign-in state', () => {
    const line = statusLineOf(
      student({ enrolled_at: '2026-08-18T13:46:23Z', first_signed_in_at: null, last_seen_at: null }),
      NOW,
    );
    expect(line.joined).toBe('Joined 18 Aug 2026');
    expect(line.activity).toEqual({ key: 'never_signed_in', text: 'Never signed in', tone: 'warning' });
  });

  it('shows a recent visit calmly and a missing account as an error', () => {
    expect(statusLineOf(student({ last_seen_at: iso(NOW - 2 * HOUR) }), NOW).activity).toEqual({
      key: 'active',
      text: 'Seen 2h ago',
      tone: 'neutral',
    });
    expect(statusLineOf(student({ ms_oid: null }), NOW).activity).toEqual({
      key: 'no_microsoft',
      text: 'No Microsoft account',
      tone: 'error',
    });
  });

  it('omits the join date when it is unknown', () => {
    expect(statusLineOf(student({ enrolled_at: null }), NOW).joined).toBeNull();
  });
});

describe('stored preferences', () => {
  it('falls back to defaults for anything unrecognised', () => {
    expect(parseStoredSort('joined_newest')).toBe('joined_newest');
    expect(parseStoredSort('bogus')).toBe('name');
    expect(parseStoredSort(null)).toBe('name');
    expect(parseStoredFilters('{"signIn":"never","account":"no_microsoft","form":"missing"}')).toEqual({
      signIn: 'never',
      account: 'no_microsoft',
      form: 'missing',
    });
    expect(parseStoredFilters('{"signIn":"nope"}')).toEqual(DEFAULT_FILTERS);
    expect(parseStoredFilters('not json')).toEqual(DEFAULT_FILTERS);
    // An inherited property name must not pass as a stored choice.
    expect(parseStoredFilters('{"signIn":"toString","account":"constructor","form":"valueOf"}')).toEqual(
      DEFAULT_FILTERS,
    );
  });

  it('reads filters saved before the form filter existed', () => {
    expect(parseStoredFilters('{"signIn":"never","account":"any"}')).toEqual({
      signIn: 'never',
      account: 'any',
      form: 'any',
    });
  });

  it('counts only the facets that narrow', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ signIn: 'never', account: 'no_microsoft', form: 'missing' })).toBe(3);
  });
});
