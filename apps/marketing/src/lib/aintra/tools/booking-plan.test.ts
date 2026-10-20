import { describe, it, expect } from 'vitest';
import { availableDemoDays, DEFAULT_DEMO_SCHEDULE } from '@neram/database/demo-schedule';
import { parseBookArgs } from '../booking';
import {
  describeMyStatus,
  intentCard,
  planCallback,
  planDemoBooking,
  planDemoCancel,
  resolveDay,
  resolveDemoWindow,
  type DemoFacts,
} from './booking-plan';

// Monday 19 Oct 2026, 11:30 India time.
const NOW = new Date('2026-10-19T06:00:00Z');
const schedule = DEFAULT_DEMO_SCHEDULE;
const days = availableDemoDays(NOW, schedule);
const open = days[1] ?? days[0];
const openWindow = open.windows[0];
const closedWindow = schedule.windows.map((w) => w.id).find((id) => !open.windows.includes(id));

const guest: DemoFacts = { schedule, signedIn: false, phoneVerified: false, accountName: null, knownExamYear: null, existing: null };
const verified: DemoFacts = { ...guest, signedIn: true, phoneVerified: true, accountName: 'Priya Kumar', knownExamYear: 2027 };

function cardOf(result: ReturnType<typeof planDemoBooking>) {
  expect(result.ok).toBe(true);
  const card = result.ok ? result.card ?? '' : '';
  return parseBookArgs(card.replace(/^\[\[book:|\]\]$/g, ''), NOW);
}

describe('resolveDay / resolveDemoWindow', () => {
  it('reads today, tomorrow and dates; rejects anything else', () => {
    expect(resolveDay('today', NOW)).toBe('2026-10-19');
    expect(resolveDay('Tomorrow', NOW)).toBe('2026-10-20');
    expect(resolveDay('2026-10-22', NOW)).toBe('2026-10-22');
    expect(resolveDay('next week', NOW)).toBeNull();
    expect(resolveDay(42, NOW)).toBeNull();
  });

  it('accepts "any time" as anytime and nothing outside the four windows', () => {
    expect(resolveDemoWindow('Any time')).toBe('anytime');
    expect(resolveDemoWindow('Evening')).toBe('evening');
    expect(resolveDemoWindow('night')).toBeNull();
  });
});

describe('planDemoBooking', () => {
  it('prepares a full card for a verified student, filling the name and exam year from the account', () => {
    const r = planDemoBooking({ date: open.date, window: openWindow }, verified, NOW);
    const s = cardOf(r);
    expect(s).toMatchObject({ kind: 'demo', date: open.date, window: openWindow, draft: { name: 'Priya Kumar', examYear: 2027 } });
    expect(r.ok && (r.data as any).card_still_asks_for).toEqual([]);
    expect(r.ok && (r.data as any).next_step).toMatch(/taps Confirm/);
  });

  it('uses the name and year from the chat over the account (a parent booking for a child)', () => {
    const r = planDemoBooking({ date: open.date, window: openWindow, student_name: 'Arun', exam_year: 2028, parent_joining: true }, verified, NOW);
    expect(cardOf(r)?.draft).toEqual({ name: 'Arun', examYear: 2028, parentJoining: true });
  });

  it('tells the model a guest signs in on the card, and lists what the card still needs', () => {
    const r = planDemoBooking({ window: 'anytime' }, guest, NOW);
    expect(cardOf(r)).toMatchObject({ kind: 'demo', date: null, window: 'anytime' });
    expect(r.ok && (r.data as any).next_step).toMatch(/signs in/);
    expect(r.ok && (r.data as any).card_still_asks_for).toEqual(['student name', 'exam year']);
  });

  it('asks a signed-in student without a verified phone to verify it on the card', () => {
    const r = planDemoBooking({ window: 'anytime' }, { ...verified, phoneVerified: false }, NOW);
    expect(r.ok && (r.data as any).next_step).toMatch(/verifies their phone/);
  });

  it('refuses a time that is not open and lists the open ones', () => {
    if (!closedWindow) return;
    const r = planDemoBooking({ date: open.date, window: closedWindow }, verified, NOW);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe('slot_not_open');
    expect(!r.ok && (r.open_slots as string[]).length).toBeGreaterThan(0);
  });

  it('refuses a day that is not offered at all', () => {
    const r = planDemoBooking({ date: '2027-03-01', window: 'evening' }, verified, NOW);
    expect(!r.ok && r.error).toBe('slot_not_open');
  });

  it('ignores an implausible exam year from the model', () => {
    const r = planDemoBooking({ window: 'anytime', exam_year: 1999 }, guest, NOW);
    expect(cardOf(r)?.draft?.examYear).toBeUndefined();
  });

  it('never prepares a second demo: shows the one they have', () => {
    const existing = { ref: 'DEM-1', status: 'pending', preferredDate: open.date, preferredWindow: openWindow };
    const r = planDemoBooking({}, { ...verified, existing }, NOW);
    expect(r.ok && (r.data as any).mode).toBe('already_booked');
    expect(cardOf(r)).toEqual({ kind: 'demo', date: null, window: null });
  });

  it('prepares a time change for an open demo', () => {
    const existing = { ref: 'DEM-1', status: 'pending', preferredDate: null, preferredWindow: 'anytime' };
    const r = planDemoBooking({ date: open.date, window: openWindow }, { ...verified, existing }, NOW);
    expect(r.ok && (r.data as any).mode).toBe('change_time');
    expect(cardOf(r)).toMatchObject({ kind: 'demo', date: open.date, window: openWindow, change: true });
  });

  it('will not move a confirmed demo', () => {
    const existing = { ref: 'DEM-1', status: 'approved', preferredDate: open.date, preferredWindow: openWindow };
    const r = planDemoBooking({ date: open.date, window: openWindow }, { ...verified, existing }, NOW);
    expect(!r.ok && r.error).toBe('demo_already_confirmed');
  });
});

describe('planDemoCancel', () => {
  const existing = { ref: 'DEM-9', status: 'pending', preferredDate: null, preferredWindow: 'anytime' };

  it('prepares a cancel card carrying the reason', () => {
    const r = planDemoCancel({ reason: 'Exam clash, sorry' }, { signedIn: true, existing, schedule });
    expect(r.ok).toBe(true);
    const s = parseBookArgs((r.ok ? r.card ?? '' : '').replace(/^\[\[book:|\]\]$/g, ''), NOW);
    expect(s).toEqual({ kind: 'cancel-demo', date: null, window: null, draft: { reason: 'Exam clash, sorry' } });
  });

  it('needs a signed-in visitor with an open demo', () => {
    expect(planDemoCancel({}, { signedIn: false, existing: null, schedule })).toMatchObject({ ok: false, error: 'not_signed_in' });
    expect(planDemoCancel({}, { signedIn: true, existing: null, schedule })).toMatchObject({ ok: false, error: 'no_active_demo' });
  });
});

describe('planCallback', () => {
  it('prepares a callback with the topic', () => {
    const r = planCallback({ date: 'tomorrow', slot: 'evening', topic: 'Fees for the 1-year course' }, false, NOW);
    expect(r.ok).toBe(true);
    const s = parseBookArgs((r.ok ? r.card ?? '' : '').replace(/^\[\[book:|\]\]$/g, ''), NOW);
    expect(s).toEqual({ kind: 'callback', date: '2026-10-20', window: 'evening', draft: { topic: 'Fees for the 1-year course' } });
    expect(r.ok && (r.data as any).next_step).toMatch(/never in the chat/);
  });

  it('refuses a slot that has passed today, and a day out of range', () => {
    expect(planCallback({ date: 'today', slot: 'morning' }, true, NOW)).toMatchObject({ ok: false, error: 'slot_not_open' });
    expect(planCallback({ date: '2026-11-30', slot: 'morning' }, true, NOW)).toMatchObject({ ok: false, error: 'day_not_open' });
  });
});

describe('intentCard (backup model safety net)', () => {
  it('gives the plain card for a clear request', () => {
    expect(intentCard('Please book a free demo class for my daughter')).toBe('[[book:demo]]');
    expect(intentCard('I need to cancel my demo')).toBe('[[book:cancel-demo]]');
    expect(intentCard('Can someone call me back tomorrow?')).toBe('[[book:callback]]');
  });

  it('gives nothing for a question about demos', () => {
    expect(intentCard('How long is the demo class?')).toBeNull();
    expect(intentCard('What are the fees?')).toBeNull();
  });
});

describe('describeMyStatus', () => {
  it('needs a sign-in', () => {
    expect(describeMyStatus({ signedIn: false, schedule, demo: null, callback: null, application: null })).toMatchObject({ ok: false });
  });

  it('describes the demo, callback and application in plain words', () => {
    const r = describeMyStatus({
      signedIn: true,
      schedule,
      demo: { ref: 'DEM-2', status: 'approved', preferredDate: null, preferredWindow: 'anytime' },
      callback: null,
      application: { status: 'draft', applicationNumber: null },
    });
    expect(r.ok && (r.data as any).demo_class.status).toMatch(/confirmed/);
    expect(r.ok && (r.data as any).callback).toBe('none');
    expect(r.ok && (r.data as any).application.status).toMatch(/not submitted/);
  });
});
