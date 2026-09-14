import { describe, expect, it } from 'vitest';
import {
  backInNexus,
  daysSince,
  deviceFromUserAgent,
  dormantDetailsOf,
  dormantViewCounts,
  matchesDormantView,
  isNotStarted,
  isPausedByStaff,
  joinReminderDue,
  joinReminderMessage,
  needsDecision,
  participationEventTitle,
  planEntry,
  signInOutcomeLabel,
} from './not-started';

const NOW = new Date('2026-09-14T12:00:00Z').getTime();
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();
const minutesAgo = (n: number) => new Date(NOW - n * 60 * 1000).toISOString();

const notStarted = (since: string) => ({
  participation_status: 'dormant',
  dormant_source: 'auto',
  dormant_since: since,
});
const paused = (since: string) => ({
  participation_status: 'dormant',
  dormant_source: 'staff',
  dormant_since: since,
});

describe('isNotStarted / isPausedByStaff', () => {
  it('tells the two kinds of dormant apart', () => {
    expect(isNotStarted(notStarted(daysAgo(1)))).toBe(true);
    expect(isPausedByStaff(notStarted(daysAgo(1)))).toBe(false);
    expect(isNotStarted(paused(daysAgo(1)))).toBe(false);
    expect(isPausedByStaff(paused(daysAgo(1)))).toBe(true);
  });

  // Rows written before 20260919090000 carry no source; every one was a staff decision.
  it('treats a dormant row with no source as paused by staff', () => {
    expect(isPausedByStaff({ participation_status: 'dormant', dormant_source: null })).toBe(true);
  });

  it('is false for an active student and for nothing', () => {
    expect(isNotStarted({ participation_status: 'active' })).toBe(false);
    expect(isPausedByStaff({ participation_status: 'active' })).toBe(false);
    expect(isNotStarted(null)).toBe(false);
  });
});

describe('daysSince', () => {
  it('counts whole days and never goes negative', () => {
    expect(daysSince(daysAgo(0), NOW)).toBe(0);
    expect(daysSince(daysAgo(2.9), NOW)).toBe(2);
    expect(daysSince(new Date(NOW + 1000).toISOString(), NOW)).toBe(0);
    expect(daysSince(null, NOW)).toBeNull();
    expect(daysSince('not a date', NOW)).toBeNull();
  });
});

describe('joinReminderDue', () => {
  it('sends nothing on the day they join', () => {
    expect(joinReminderDue(daysAgo(0), 0, NOW)).toBeNull();
  });

  it('sends the first reminder from day 1', () => {
    expect(joinReminderDue(daysAgo(1), 0, NOW)).toBe(1);
  });

  it('waits for day 3 before the second', () => {
    expect(joinReminderDue(daysAgo(2), 1, NOW)).toBeNull();
    expect(joinReminderDue(daysAgo(3), 1, NOW)).toBe(2);
  });

  it('sends the third on day 7 and then stops', () => {
    expect(joinReminderDue(daysAgo(7), 2, NOW)).toBe(3);
    expect(joinReminderDue(daysAgo(8), 3, NOW)).toBeNull();
    expect(joinReminderDue(daysAgo(40), 3, NOW)).toBeNull();
  });

  // The backfill marks students who joined weeks ago. They get one a day, not three at once.
  it('catches up a long Not started student one reminder at a time', () => {
    expect(joinReminderDue(daysAgo(27), 0, NOW)).toBe(1);
    expect(joinReminderDue(daysAgo(27), 1, NOW)).toBe(2);
    expect(joinReminderDue(daysAgo(27), 2, NOW)).toBe(3);
  });

  it('is null without a start date', () => {
    expect(joinReminderDue(null, 0, NOW)).toBeNull();
  });
});

describe('needsDecision', () => {
  it('asks staff after 14 days Not started', () => {
    expect(needsDecision(notStarted(daysAgo(13)), NOW)).toBe(false);
    expect(needsDecision(notStarted(daysAgo(14)), NOW)).toBe(true);
  });

  it('never asks about a student staff already paused', () => {
    expect(needsDecision(paused(daysAgo(40)), NOW)).toBe(false);
  });
});

describe('backInNexus', () => {
  it('flags a paused student who signed in after being paused', () => {
    expect(backInNexus(paused(daysAgo(5)), daysAgo(2))).toBe(true);
  });

  it('does not flag a sign-in from before the pause', () => {
    expect(backInNexus(paused(daysAgo(5)), daysAgo(9))).toBe(false);
    expect(backInNexus(paused(daysAgo(5)), null)).toBe(false);
  });

  it('never flags a Not started student (their first entry lifts them instead)', () => {
    expect(backInNexus(notStarted(daysAgo(5)), daysAgo(1))).toBe(false);
  });
});

describe('deviceFromUserAgent', () => {
  it('reads the common devices', () => {
    expect(
      deviceFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'),
    ).toBe('Phone');
    expect(
      deviceFromUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36'),
    ).toBe('Phone');
    expect(deviceFromUserAgent('Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Chrome/128.0 Safari/537.36')).toBe(
      'Tablet',
    );
    expect(deviceFromUserAgent('Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X)')).toBe('Tablet');
    expect(deviceFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0 Safari/537.36')).toBe('Laptop');
    expect(deviceFromUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('Laptop');
  });

  it('returns null when it cannot tell', () => {
    expect(deviceFromUserAgent('')).toBeNull();
    expect(deviceFromUserAgent(null)).toBeNull();
    expect(deviceFromUserAgent('curl/8.0')).toBeNull();
  });
});

describe('planEntry', () => {
  const base = {
    isStudent: true,
    impersonating: false,
    hasClassroom: true,
    photoGateRequired: false,
    enteredAt: null as string | null,
    lastLoginAt: null as string | null,
    now: NOW,
  };

  it('records a first entry and lifts Not started', () => {
    expect(planEntry(base)).toEqual({ logOutcome: 'entered', firstEntry: true });
  });

  it('records a stop at the photo step without lifting anything', () => {
    expect(planEntry({ ...base, photoGateRequired: true })).toEqual({ logOutcome: 'photo_step', firstEntry: false });
  });

  it('does not repeat first entry for a student who already entered', () => {
    expect(planEntry({ ...base, enteredAt: daysAgo(10), lastLoginAt: daysAgo(1) })).toEqual({
      logOutcome: 'entered',
      firstEntry: false,
    });
  });

  it('throttles sign-in rows to one per 30 minutes', () => {
    expect(planEntry({ ...base, enteredAt: daysAgo(10), lastLoginAt: minutesAgo(10) }).logOutcome).toBeNull();
    expect(planEntry({ ...base, enteredAt: daysAgo(10), lastLoginAt: minutesAgo(30) }).logOutcome).toBe('entered');
    expect(planEntry({ ...base, photoGateRequired: true, lastLoginAt: minutesAgo(5) }).logOutcome).toBeNull();
  });

  // Uploading a photo from the gate re-runs /me within seconds. That entry must land.
  it('never throttles the first entry itself', () => {
    expect(planEntry({ ...base, lastLoginAt: minutesAgo(1) })).toEqual({ logOutcome: 'entered', firstEntry: true });
  });

  it('writes nothing for staff, parents or View as Student', () => {
    expect(planEntry({ ...base, isStudent: false })).toEqual({ logOutcome: null, firstEntry: false });
    expect(planEntry({ ...base, impersonating: true })).toEqual({ logOutcome: null, firstEntry: false });
  });

  // The gate does not apply without a classroom, so getting past it proves nothing.
  // Stamping entry here would let a later enrolment skip Not started entirely.
  it('does not count a student with no classroom yet as entered', () => {
    expect(planEntry({ ...base, hasClassroom: false })).toEqual({ logOutcome: null, firstEntry: false });
  });
});

describe('joinReminderMessage', () => {
  it('has three different messages that all name the student and never use dashes', () => {
    const all = [joinReminderMessage(1), joinReminderMessage(2), joinReminderMessage(3)];
    expect(new Set(all.map((m) => m.plain)).size).toBe(3);
    for (const m of all) {
      expect(m.plain).toContain('{firstName}');
      expect(`${m.subject} ${m.plain}`).not.toMatch(/—|--/);
    }
    expect(all[2].plain).toContain('last reminder');
  });
});

describe('participationEventTitle', () => {
  it('reads the system rows by their reason', () => {
    expect(participationEventTitle(null, 'dormant', 'Not started: has not entered Nexus yet')).toBe(
      'Marked Not started (has not entered Nexus)',
    );
    expect(participationEventTitle('dormant', 'active', 'Entered Nexus')).toBe(
      'Entered Nexus, now counted in class numbers',
    );
  });

  it('reads staff decisions', () => {
    expect(participationEventTitle('active', 'dormant', 'She is asking for refund')).toBe('Paused by staff');
    expect(participationEventTitle('not_started', 'dormant', 'Joining later')).toBe('Paused by staff');
    expect(participationEventTitle('dormant', 'active', null)).toBe('Brought back by staff');
    expect(participationEventTitle('not_started', 'active', null)).toBe('Counted in class numbers by staff');
  });
});

describe('the Dormant segment', () => {
  const chetana = {
    participation_status: 'dormant',
    dormant_source: 'staff',
    dormant_since: daysAgo(4),
    dormant_reason: 'She is asking for refund',
    dormant_by_name: 'Hari',
    last_seen_at: daysAgo(2),
  };
  const shakthi = {
    participation_status: 'dormant',
    dormant_source: 'auto',
    dormant_since: daysAgo(31),
    last_sign_in: null,
    join_reminders_sent: 3,
    attendance: { attended: 5 },
  };
  const dhisha = {
    participation_status: 'dormant',
    dormant_source: 'auto',
    dormant_since: daysAgo(3),
    last_sign_in: { at: daysAgo(1), outcome: 'photo_step' },
    join_reminders_sent: 0,
    attendance: { attended: 0 },
  };
  const active = { participation_status: 'active', dormant_source: null };

  it('counts each narrowing over the same rows', () => {
    expect(dormantViewCounts([chetana, shakthi, dhisha, active], NOW)).toEqual({
      all: 3,
      not_started: 2,
      not_started_long: 1,
      paused: 1,
      back_in_nexus: 1,
    });
  });

  it('matches the long Not started view only after 14 days', () => {
    expect(matchesDormantView(shakthi, 'not_started_long', NOW)).toBe(true);
    expect(matchesDormantView(dhisha, 'not_started_long', NOW)).toBe(false);
  });

  it('says why a paused student is out, in words, and flags a return', () => {
    const lines = dormantDetailsOf(chetana, NOW);
    expect(lines[0].text).toMatch(/^Paused \d{1,2} \w+ by Hari: She is asking for refund$/);
    expect(lines[1]).toEqual({ kind: 'back_in_nexus', text: 'Back in Nexus 2 days ago', tone: 'warning' });
  });

  it('describes a long Not started student who attends on Teams', () => {
    expect(dormantDetailsOf(shakthi, NOW).map((d) => d.text)).toEqual([
      'Not started for 31 days',
      'Attended 5 classes on Teams',
      'Reminded 3 times',
    ]);
    expect(dormantDetailsOf(shakthi, NOW)[0].tone).toBe('warning');
  });

  it('tells a stop at the photo step apart from never trying', () => {
    expect(dormantDetailsOf(dhisha, NOW).map((d) => d.text)).toEqual([
      'Not started for 3 days',
      'Stopped at the photo step yesterday',
    ]);
  });

  it('says nothing for a participating student', () => {
    expect(dormantDetailsOf(active, NOW)).toEqual([]);
  });
});

describe('signInOutcomeLabel', () => {
  it('reads plainly', () => {
    expect(signInOutcomeLabel('entered')).toBe('Entered Nexus');
    expect(signInOutcomeLabel('photo_step')).toBe('Stopped at the photo step');
  });
});
