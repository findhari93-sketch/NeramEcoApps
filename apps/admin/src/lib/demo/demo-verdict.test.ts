import { describe, it, expect } from 'vitest';
import { autoFollowUpAt, autoPickRecording, demoVerdict, verdictAction } from './demo-verdict';
import type { DemoAttendee, DemoRecordingFile } from './teams-evidence';
import type { DemoTranscriptStats } from './demo-transcript';

// DEMO-JWQ8: booked 10:00 to 10:45 IST on 20 Oct (04:30 to 05:15 UTC).
const start = '2026-10-20T04:30:00.000Z';
const at = (iso: string) => new Date(iso);
const person = (name: string, staff: boolean, ...spans: Array<[string, string]>): DemoAttendee => ({
  name,
  email: null,
  role: staff ? 'Organizer' : 'Attendee',
  staff,
  seconds: 0,
  firstJoin: spans[0]?.[0] ?? null,
  lastLeave: spans[spans.length - 1]?.[1] ?? null,
  intervals: spans.map(([join, leave]) => ({ join, leave })),
});
const hari = (...s: Array<[string, string]>) => person('Hari Babu', true, ...s);
const heera = (...s: Array<[string, string]>) => person('Hari Heera', false, ...s);
const verdict = (attendance: DemoAttendee[] | null, now: string, transcript: DemoTranscriptStats | null = null) =>
  demoVerdict({ start, minutes: 45, attendance, transcript, now: at(now) });

describe('demoVerdict', () => {
  it('a student with the team for 15 minutes or more is Held', () => {
    const v = verdict([hari(['2026-10-20T04:28:00Z', '2026-10-20T05:12:00Z']), heera(['2026-10-20T04:33:00Z', '2026-10-20T05:10:00Z'])], '2026-10-20T05:20:00Z');
    expect(v).toMatchObject({ kind: 'held', guest: 'Hari Heera', together: 37 });
    expect(v?.reason).toBe('Hari Heera was in the meeting with Hari for 37 min.');
  });

  it('counts only the time together: a student alone in the meeting is not a demo', () => {
    const v = verdict([hari(['2026-10-20T04:30:00Z', '2026-10-20T04:40:00Z']), heera(['2026-10-20T04:30:00Z', '2026-10-20T05:15:00Z'])], '2026-10-20T06:30:00Z');
    expect(v).toMatchObject({ kind: 'unclear', together: 10 });
  });

  it('the founder test: a session the evening before never counts as the demo', () => {
    const test = [hari(['2026-10-19T17:20:00Z', '2026-10-19T17:45:00Z']), heera(['2026-10-19T17:21:00Z', '2026-10-19T17:44:00Z'])];
    expect(verdict(test, '2026-10-20T05:00:00Z')).toBeNull();
    const v = verdict(test, '2026-10-20T06:30:00Z');
    expect(v?.kind).toBe('unclear');
    expect(v?.reason).toContain('not at the booked time');
  });

  it('the team waiting alone becomes No-show an hour after the booked end, not before', () => {
    const alone = [hari(['2026-10-20T04:28:00Z', '2026-10-20T04:50:00Z'])];
    expect(verdict(alone, '2026-10-20T05:30:00Z')).toBeNull();
    expect(verdict(alone, '2026-10-20T06:20:00Z')).toMatchObject({ kind: 'no_show', reason: 'Nobody outside Neram joined. Hari waited 22 min.' });
  });

  it('nobody at all, or Teams unreadable, waits for a person', () => {
    expect(verdict([], '2026-10-20T06:30:00Z')?.kind).toBe('unclear');
    expect(verdict(null, '2026-10-20T06:30:00Z')?.reason).toContain('could not be read');
  });

  it('the transcript adds to the reason, and on its own proves a real conversation', () => {
    const stats = (guestWords: number, staffWords: number, minutes = 30): DemoTranscriptStats => ({
      minutes,
      cues: 40,
      staffWords,
      guestWords,
      speakers: [
        { name: 'Hari Babu', staff: true, words: staffWords, seconds: 900 },
        { name: 'Hari Heera', staff: false, words: guestWords, seconds: 300 },
      ],
    });
    const together = [hari(['2026-10-20T04:28:00Z', '2026-10-20T05:12:00Z']), heera(['2026-10-20T04:33:00Z', '2026-10-20T05:10:00Z'])];
    expect(verdict(together, '2026-10-20T05:20:00Z', stats(412, 2000))?.reason).toContain('412 words from the student');
    expect(verdict(together, '2026-10-20T05:20:00Z', stats(0, 2000))?.reason).toContain('did not speak');
    expect(verdict(null, '2026-10-20T05:20:00Z', stats(400, 1800))).toMatchObject({ kind: 'held', guest: 'Hari Heera' });
    // One side talking (the tutor rehearsing alone) is not a demo.
    expect(verdict(null, '2026-10-20T05:20:00Z', stats(0, 3000))).toBeNull();
  });

  it('is too early to say before 15 minutes have passed', () => {
    expect(verdict([], '2026-10-20T04:40:00Z')).toBeNull();
  });
});

describe('verdictAction', () => {
  const held = { kind: 'held' as const };
  it('marks a scheduled demo either way, and never touches a staff mark', () => {
    expect(verdictAction('approved', null, held)).toBe('mark_attended');
    expect(verdictAction('approved', null, { kind: 'no_show' })).toBe('mark_no_show');
    expect(verdictAction('approved', null, { kind: 'unclear' })).toBeNull();
    expect(verdictAction('no_show', 'staff', held)).toBeNull();
    expect(verdictAction('no_show', null, held)).toBeNull();
    expect(verdictAction('attended', 'teams', { kind: 'no_show' })).toBeNull();
  });
  it('turns a Teams No-show into Attended when the student joined late', () => {
    expect(verdictAction('no_show', 'teams', held)).toBe('mark_attended');
  });
});

describe('autoFollowUpAt', () => {
  const ist = (d: Date) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: false }).format(d);
  it('two hours after a morning demo, the next morning after an evening one', () => {
    const now = at('2026-10-20T05:20:00Z');
    expect(ist(autoFollowUpAt(at('2026-10-20T05:15:00Z').getTime(), now))).toBe('20, 12:45');
    expect(ist(autoFollowUpAt(at('2026-10-20T13:00:00Z').getTime(), at('2026-10-20T13:10:00Z')))).toBe('21, 10:00');
  });
});

describe('autoPickRecording', () => {
  const file = (itemId: string, createdAt: string, durationMs: number): DemoRecordingFile => ({
    driveId: 'd',
    itemId,
    name: `DEMO-JWQ8-${itemId}.mp4`,
    webUrl: 'https://x',
    createdAt,
    size: durationMs,
    durationMs,
  });
  it('takes the longest video made around the booked time, never the test the day before', () => {
    const files = [
      file('test', '2026-10-19T17:20:00Z', 30 * 60_000),
      file('blip', '2026-10-20T04:31:00Z', 60_000),
      file('real', '2026-10-20T04:32:00Z', 40 * 60_000),
    ];
    expect(autoPickRecording(files, start, 45)?.itemId).toBe('real');
    expect(autoPickRecording([files[0]], start, 45)).toBeNull();
  });
});
