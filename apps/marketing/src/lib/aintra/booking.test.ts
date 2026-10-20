import { describe, it, expect } from 'vitest';
import {
  addDays,
  aintraCallbackNote,
  callbackDays,
  cleanIndianMobile,
  cleanPreferredDate,
  describeCallbackTime,
  formatBookMarker,
  istToday,
  maskPhone,
  parseBookArgs,
  pickCallbackDefault,
} from './booking';
import { parseAintraAnswer } from './rich/parse';
import { demoDaysPrompt, visitorBookingsPrompt, visitorPrompt } from './booking-prompt';
import { DEFAULT_DEMO_SCHEDULE } from '@neram/database/demo-schedule';

// Monday 19 Oct 2026, 11:30 India time: the morning slot has just closed.
const MORNING = new Date('2026-10-19T06:00:00Z');
// Same day, 19:30 India time: only the evening is nearly over.
const LATE = new Date('2026-10-19T14:00:00Z');

describe('parseBookArgs', () => {
  it('reads the kind, a date and a window in any order', () => {
    expect(parseBookArgs('demo,2026-10-21,evening', MORNING)).toEqual({ kind: 'demo', date: '2026-10-21', window: 'evening' });
    expect(parseBookArgs('callback | evening | tomorrow', MORNING)).toEqual({ kind: 'callback', date: '2026-10-20', window: 'evening' });
    expect(parseBookArgs('demo,anytime', MORNING)).toEqual({ kind: 'demo', date: null, window: 'anytime' });
  });

  it('drops what it does not know, and an unknown kind', () => {
    expect(parseBookArgs('callback,soon,2026-13-45', MORNING)).toEqual({ kind: 'callback', date: null, window: null });
    expect(parseBookArgs('meeting,tomorrow', MORNING)).toBeNull();
  });

  it('treats "anytime" on a callback as no preference', () => {
    expect(parseBookArgs('callback,anytime', MORNING)?.window).toBeNull();
  });

  it('reads a server-written draft, keeping the case and punctuation of a name', () => {
    expect(parseBookArgs('demo,2026-10-21,evening,name=Priya%20K%2C%20Jr,year=2027,parent=yes', MORNING)).toEqual({
      kind: 'demo',
      date: '2026-10-21',
      window: 'evening',
      draft: { name: 'Priya K, Jr', examYear: 2027, parentJoining: true },
    });
    expect(parseBookArgs('demo,2026-10-21,evening,change', MORNING)?.change).toBe(true);
    expect(parseBookArgs('cancel-demo,tomorrow,reason=exam%20clash', MORNING)).toEqual({
      kind: 'cancel-demo',
      date: null,
      window: null,
      draft: { reason: 'exam clash' },
    });
  });

  it('carries a short form\'s fields, and drops a time on the untimed cards', () => {
    const s = {
      kind: 'visit' as const,
      date: '2026-10-22',
      window: null,
      draft: { fields: { centreId: 'c2', centreName: 'Tambaram, Chennai', slots: '10:00 AM - 12:00 PM|2:00 PM - 5:00 PM' } },
    };
    expect(parseBookArgs(formatBookMarker(s).slice(7, -2), MORNING)).toEqual(s);
    expect(parseBookArgs('apply,tomorrow,evening', MORNING)).toEqual({ kind: 'apply', date: null, window: null });
    expect(parseBookArgs('message,f.subject=Hi%2C%20there,f.bad-key=x', MORNING)?.draft).toEqual({ fields: { subject: 'Hi, there' } });
  });

  it('round-trips through formatBookMarker, whatever the name holds', () => {
    const s = { kind: 'demo' as const, date: '2026-10-21', window: 'morning' as const, draft: { name: 'A]]B | C, D', examYear: 2028, parentJoining: false } };
    const marker = formatBookMarker(s);
    expect(marker).toMatch(/^\[\[book:[^\]\n]+\]\]$/);
    expect(parseBookArgs(marker.slice(7, -2), MORNING)).toEqual(s);
  });
});

describe('callback days', () => {
  it('offers four days, today with only the slots still open', () => {
    const days = callbackDays(MORNING);
    expect(days.map((d) => d.label)).toEqual(['Today', 'Tomorrow', 'Wed, 21 Oct', 'Thu, 22 Oct']);
    expect(days[0].slots).toEqual(['afternoon', 'evening']);
    expect(days[1].slots).toEqual(['morning', 'afternoon', 'evening']);
  });

  it('skips today once every slot has closed', () => {
    const days = callbackDays(LATE);
    expect(days[0].label).toBe('Tomorrow');
    expect(days).toHaveLength(4);
  });

  it('starts on the suggestion when it is offered, else the first open slot', () => {
    const days = callbackDays(MORNING);
    expect(pickCallbackDefault(days, { date: '2026-10-20', window: 'evening' })).toEqual({ date: '2026-10-20', slot: 'evening' });
    // Morning today has passed: same day, first open slot.
    expect(pickCallbackDefault(days, { date: '2026-10-19', window: 'morning' })).toEqual({ date: '2026-10-19', slot: 'afternoon' });
    // A date not offered: the first day that has the asked-for slot.
    expect(pickCallbackDefault(days, { date: '2027-01-01', window: 'morning' })).toEqual({ date: '2026-10-20', slot: 'morning' });
    expect(pickCallbackDefault(days, { date: null, window: null })).toEqual({ date: '2026-10-19', slot: 'afternoon' });
  });

  it('says when, the way a person would', () => {
    expect(describeCallbackTime('2026-10-19', 'evening', MORNING)).toBe('this evening');
    expect(describeCallbackTime('2026-10-20', 'morning', MORNING)).toBe('tomorrow morning');
    expect(describeCallbackTime('2026-10-21', 'afternoon', MORNING)).toBe('Wed, 21 Oct in the afternoon');
  });
});

describe('cleanPreferredDate', () => {
  it('keeps today to 14 days ahead in India time', () => {
    expect(cleanPreferredDate('2026-10-19', MORNING)).toBe('2026-10-19');
    expect(cleanPreferredDate('2026-11-02', MORNING)).toBe('2026-11-02');
    expect(cleanPreferredDate('2026-11-03', MORNING)).toBeNull();
    expect(cleanPreferredDate('2026-10-18', MORNING)).toBeNull();
    expect(cleanPreferredDate('tomorrow', MORNING)).toBeNull();
    expect(cleanPreferredDate(undefined, MORNING)).toBeNull();
  });

  it('uses the India date, not UTC, near midnight', () => {
    // 20 Oct 00:30 India is still 19 Oct in UTC.
    const justAfterMidnight = new Date('2026-10-19T19:00:00Z');
    expect(istToday(justAfterMidnight)).toBe('2026-10-20');
    expect(cleanPreferredDate('2026-10-19', justAfterMidnight)).toBeNull();
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });
});

describe('phone helpers', () => {
  it('accepts Indian mobiles with +91, 0 or spaces', () => {
    expect(cleanIndianMobile('+91 98765 43210')).toBe('9876543210');
    expect(cleanIndianMobile('09876543210')).toBe('9876543210');
    expect(cleanIndianMobile('5876543210')).toBeNull();
    expect(cleanIndianMobile('98765')).toBeNull();
  });

  it('masks all but enough to recognise the number', () => {
    expect(maskPhone('+919876543210')).toBe('+91 98xxx xx210');
  });

  it('notes the chat session so staff can open the chat', () => {
    expect(aintraCallbackNote('s-123456', '  Fees for the 1-year course ')).toBe('Aintra chat: s-123456. Fees for the 1-year course');
    expect(aintraCallbackNote(null, '')).toBe('Aintra chat');
  });
});

describe('[[book:...]] in an answer', () => {
  it('becomes one card per kind, with the suggestion', () => {
    const { blocks } = parseAintraAnswer('Sure, pick a time below.\n[[book:callback,tomorrow,evening]]\n[[book:callback]]');
    const books = blocks.filter((b) => b.type === 'book');
    expect(books).toHaveLength(1);
    expect(books[0]).toMatchObject({ type: 'book', suggestion: { kind: 'callback', window: 'evening' } });
  });

  it('is found mid-sentence too', () => {
    const { blocks } = parseAintraAnswer('Happy to help. [[book:demo,2026-10-21,morning]]');
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'book']);
  });

  it('is held back while it is still streaming in', () => {
    const { blocks } = parseAintraAnswer('Pick a slot.\n[[book:de', { streaming: true });
    expect(blocks.map((b) => b.type)).toEqual(['paragraph']);
  });

  it('drops an unknown kind', () => {
    const { blocks } = parseAintraAnswer('Ok.\n[[book:meeting]]');
    expect(blocks.map((b) => b.type)).toEqual(['paragraph']);
  });

  it('lets the card a tool prepared replace a plain one the model wrote, in its place', () => {
    const { blocks } = parseAintraAnswer('Done.\n[[book:demo]]\nTap Confirm.\n\n[[book:demo,anytime,name=Priya,year=2027]]');
    const books = blocks.filter((b) => b.type === 'book');
    expect(books).toHaveLength(1);
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'book', 'paragraph']);
    expect(books[0]).toMatchObject({ suggestion: { window: 'anytime', draft: { name: 'Priya', examYear: 2027 } } });
  });
});

describe('visitorPrompt', () => {
  it('tells Aintra what it already knows about a signed-in visitor, never the phone number', () => {
    const text = visitorPrompt({ signedIn: true, name: 'Priya', phoneVerified: false, examYear: 2027 });
    expect(text).toContain('Name on the account: Priya');
    expect(text).toContain('Phone verified: no');
    expect(text).toContain('Exam year: 2027');
    expect(text).not.toMatch(/\d{10}/);
  });

  it('marks a guest as not signed in', () => {
    expect(visitorPrompt({ signedIn: false, name: null, phoneVerified: false, examYear: null })).toContain('Not signed in');
  });
});

describe('booking prompt', () => {
  it('lists the open demo days with the date to use', () => {
    const text = demoDaysPrompt(MORNING, DEFAULT_DEMO_SCHEDULE);
    expect(text).toContain('DEMO SLOTS NOW');
    expect(text).toContain('(2026-10-20): Morning, Afternoon, Evening');
    expect(text).not.toMatch(/—|–/);
  });

  it("tells Aintra what the visitor already has, and nothing when they have nothing", () => {
    expect(visitorBookingsPrompt({ demo: null, openCallback: null }, DEFAULT_DEMO_SCHEDULE)).toBe('');
    const text = visitorBookingsPrompt(
      {
        demo: { ref: 'DEMO-AB12', preferredDate: '2026-10-21', preferredWindow: 'evening', status: 'pending' },
        openCallback: { preferredDate: '2026-10-20', preferredSlot: 'morning' },
      },
      DEFAULT_DEMO_SCHEDULE,
    );
    expect(text).toContain('DEMO-AB12');
    expect(text).toContain('Never book a second one');
    expect(text).toContain('already asked for a callback (2026-10-20 morning)');
  });
});
