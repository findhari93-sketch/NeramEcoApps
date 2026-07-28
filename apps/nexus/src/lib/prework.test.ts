/**
 * Unit tests for the pre-class work rules.
 *
 * These carry the load for this feature: the Nexus browser E2E projects cannot
 * complete sign-in under the tenant's enforced MFA, so the boundaries have to be
 * pinned here or they are not pinned at all.
 *
 * The timezone tests are not paranoia. `start_time` is a bare SQL TIME, and a
 * bare `new Date('2026-08-20T19:00')` is parsed in the server's zone, which on
 * Vercel is UTC. That is 5.5 hours out: exactly far enough to fire the "not
 * done" strip in the middle of the class it was meant to precede.
 */
import { describe, it, expect } from 'vitest';
import {
  classStartIso,
  classEndIso,
  classifyPrework,
  preworkNeedsAttention,
  preworkStripCopy,
  preworkDueLabel,
  formatIstTime,
  PREWORK_REASON_LEAD_MINUTES,
} from './prework';

/** 2026-07-29, 19:00 IST as an epoch, the reference class in these tests. */
const START = Date.parse('2026-07-29T19:00:00+05:30');
const END = Date.parse('2026-07-29T20:30:00+05:30');
const dueAtIso = '2026-07-29T19:00:00+05:30';
const endIso = '2026-07-29T20:30:00+05:30';

const base = {
  dueAtIso,
  classEndIso: endIso,
  classStatus: 'scheduled',
  submitted: false,
  hasReason: false,
};

describe('classStartIso', () => {
  it('pins IST, so a UTC server does not shift the deadline by 5.5 hours', () => {
    expect(classStartIso('2026-07-29', '19:00')).toBe('2026-07-29T19:00:00+05:30');
    expect(Date.parse(classStartIso('2026-07-29', '19:00'))).toBe(START);
  });

  it('accepts a time that already carries seconds', () => {
    expect(classStartIso('2026-07-29', '19:00:00')).toBe('2026-07-29T19:00:00+05:30');
  });

  it('tolerates a full timestamp in the date field', () => {
    expect(classStartIso('2026-07-29T00:00:00Z', '19:00')).toBe('2026-07-29T19:00:00+05:30');
  });

  it('classEndIso is the same builder, so start and end cannot drift apart', () => {
    expect(classEndIso('2026-07-29', '20:30')).toBe('2026-07-29T20:30:00+05:30');
  });
});

describe('classifyPrework', () => {
  it('says nothing until the lead window opens', () => {
    const justBefore = START - (PREWORK_REASON_LEAD_MINUTES + 1) * 60_000;
    expect(classifyPrework({ ...base, nowMs: justBefore })).toBe('not_yet');
  });

  it('opens the window exactly at the lead time, three hours before', () => {
    const atWindow = START - PREWORK_REASON_LEAD_MINUTES * 60_000;
    expect(classifyPrework({ ...base, nowMs: atWindow })).toBe('due_soon');
    expect(classifyPrework({ ...base, nowMs: atWindow - 1 })).toBe('not_yet');
  });

  it('turns overdue exactly at the class start', () => {
    expect(classifyPrework({ ...base, nowMs: START })).toBe('overdue_unanswered');
    expect(classifyPrework({ ...base, nowMs: START - 1 })).toBe('due_soon');
  });

  it('never calls submitted work overdue, however late it was', () => {
    expect(classifyPrework({ ...base, submitted: true, nowMs: START + 60_000 })).toBe('done');
    expect(classifyPrework({ ...base, submitted: true, nowMs: END + 60_000 })).toBe('done');
  });

  it('stops asking once a reason has been given', () => {
    expect(classifyPrework({ ...base, hasReason: true, nowMs: START })).toBe('answered');
    expect(classifyPrework({ ...base, hasReason: true, nowMs: START - 60_000 })).toBe('answered');
  });

  it('hands over to the absence flow once the class has finished', () => {
    expect(classifyPrework({ ...base, nowMs: END + 1 })).toBe('stale');
    expect(classifyPrework({ ...base, hasReason: true, nowMs: END + 1 })).toBe('answered');
  });

  it('excludes a cancelled class outright, so no strip ever fires for one', () => {
    expect(classifyPrework({ ...base, classStatus: 'cancelled', nowMs: START })).toBeNull();
  });

  it('excludes work with no deadline', () => {
    expect(classifyPrework({ ...base, dueAtIso: null, nowMs: START })).toBeNull();
  });

  it('excludes an unparseable deadline rather than guessing', () => {
    expect(classifyPrework({ ...base, dueAtIso: 'not a date', nowMs: START })).toBeNull();
  });

  it('handles a late class whose window crosses back into the previous day', () => {
    const lateStart = Date.parse('2026-07-30T00:30:00+05:30');
    const input = {
      ...base,
      dueAtIso: '2026-07-30T00:30:00+05:30',
      classEndIso: '2026-07-30T02:00:00+05:30',
    };
    // Three hours before 00:30 on the 30th is 21:30 on the 29th.
    expect(classifyPrework({ ...input, nowMs: Date.parse('2026-07-29T21:30:00+05:30') })).toBe('due_soon');
    expect(classifyPrework({ ...input, nowMs: Date.parse('2026-07-29T21:29:00+05:30') })).toBe('not_yet');
    expect(classifyPrework({ ...input, nowMs: lateStart })).toBe('overdue_unanswered');
  });

  it('handles a window spanning a month boundary', () => {
    const input = {
      ...base,
      dueAtIso: '2026-08-01T01:00:00+05:30',
      classEndIso: '2026-08-01T02:30:00+05:30',
    };
    expect(classifyPrework({ ...input, nowMs: Date.parse('2026-07-31T22:00:00+05:30') })).toBe('due_soon');
  });
});

describe('preworkNeedsAttention', () => {
  it('is true only for the two states that prompt', () => {
    expect(preworkNeedsAttention('due_soon')).toBe(true);
    expect(preworkNeedsAttention('overdue_unanswered')).toBe(true);
    expect(preworkNeedsAttention('not_yet')).toBe(false);
    expect(preworkNeedsAttention('answered')).toBe(false);
    expect(preworkNeedsAttention('done')).toBe(false);
    expect(preworkNeedsAttention('stale')).toBe(false);
    expect(preworkNeedsAttention(null)).toBe(false);
  });
});

describe('preworkStripCopy', () => {
  it('shows nothing when there is nothing to chase', () => {
    expect(preworkStripCopy([])).toBeNull();
    expect(preworkStripCopy([{ state: 'done' }, { state: 'not_yet' }, { state: 'answered' }])).toBeNull();
  });

  it('the overdue strip is red and cannot be dismissed', () => {
    const copy = preworkStripCopy([{ state: 'overdue_unanswered' }]);
    expect(copy?.severity).toBe('error');
    expect(copy?.dismissible).toBe(false);
    expect(copy?.action).toBe('Tell us why');
  });

  it('the due-soon strip is amber and can be dismissed', () => {
    const copy = preworkStripCopy([{ state: 'due_soon', dueAtIso }]);
    expect(copy?.severity).toBe('warning');
    expect(copy?.dismissible).toBe(true);
    expect(copy?.text).toContain('7:00 PM');
  });

  it('overdue outranks due soon', () => {
    const copy = preworkStripCopy([{ state: 'due_soon', dueAtIso }, { state: 'overdue_unanswered' }]);
    expect(copy?.severity).toBe('error');
  });

  it('counts rather than lists when several classes are affected', () => {
    const copy = preworkStripCopy([{ state: 'overdue_unanswered' }, { state: 'overdue_unanswered' }]);
    expect(copy?.text).toContain('2 classes');
  });

  it('never contains an em dash or a double dash', () => {
    const all = [
      preworkStripCopy([{ state: 'overdue_unanswered' }]),
      preworkStripCopy([{ state: 'overdue_unanswered' }, { state: 'overdue_unanswered' }]),
      preworkStripCopy([{ state: 'due_soon', dueAtIso }]),
      preworkStripCopy([{ state: 'due_soon' }]),
      preworkStripCopy([{ state: 'due_soon' }, { state: 'due_soon' }]),
    ];
    for (const copy of all) {
      expect(copy).not.toBeNull();
      expect(`${copy!.text} ${copy!.action}`).not.toContain('—');
      expect(`${copy!.text} ${copy!.action}`).not.toContain('--');
    }
  });
});

describe('formatIstTime and preworkDueLabel', () => {
  it('renders IST regardless of the machine timezone', () => {
    expect(formatIstTime('2026-07-29T19:00:00+05:30')).toBe('7:00 PM');
    // Same instant expressed in UTC must still read as 7:00 PM IST.
    expect(formatIstTime('2026-07-29T13:30:00Z')).toBe('7:00 PM');
  });

  it('gives a time of day, not a bare date, so prework does not read as "any time that day"', () => {
    expect(preworkDueLabel(dueAtIso)).toBe('Due before class, 7:00 PM');
  });

  it('falls back cleanly with no deadline', () => {
    expect(preworkDueLabel(null)).toBe('Before the class starts');
    expect(preworkDueLabel('nonsense')).toBe('Before the class starts');
  });
});
