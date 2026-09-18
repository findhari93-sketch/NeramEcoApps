import { describe, expect, it } from 'vitest';
import {
  attendanceFlags,
  describePresence,
  presenceOf,
  registerGroupOf,
  sessionWindow,
} from './attendance-register';

/** The 15 Sep 2026 class: booked 7:00 to 8:30 PM IST, really ended about 8:10. */
const CLASS = { scheduled_date: '2026-09-15', start_time: '19:00:00', end_time: '20:30:00' };
const ist = (hhmm: string) => `2026-09-15T${hhmm}:00+05:30`;

function interval(fromHHMM: string, toHHMM: string) {
  return { joinDateTime: ist(fromHHMM), leaveDateTime: ist(toHHMM) };
}

describe('sessionWindow', () => {
  it('ends the class when 80 percent of attendees have left, not at the booked time', () => {
    const rows = [
      { attended: true, left_at: ist('20:03') },
      { attended: true, left_at: ist('20:10') },
      { attended: true, left_at: ist('20:10') },
      { attended: true, left_at: ist('20:10') },
      { attended: true, left_at: ist('20:13') },
    ];
    const w = sessionWindow(CLASS, rows);
    expect(w.source).toBe('observed');
    expect(new Date(w.endMs).toISOString()).toBe(new Date(ist('20:10')).toISOString());
    expect(w.minutes).toBe(70);
  });

  it('falls back to the booked end when fewer than three attendees have times', () => {
    const w = sessionWindow(CLASS, [{ attended: true, left_at: ist('19:30') }]);
    expect(w.source).toBe('booked');
    expect(w.minutes).toBe(90);
  });

  it('ignores absent rows when reading leave times', () => {
    const rows = [
      { attended: false, left_at: ist('19:05') },
      { attended: false, left_at: ist('19:05') },
      { attended: true, left_at: ist('20:10') },
    ];
    expect(sessionWindow(CLASS, rows).source).toBe('booked');
  });

  it('never ends the class less than 15 minutes after it started', () => {
    const rows = [
      { attended: true, left_at: ist('19:02') },
      { attended: true, left_at: ist('19:03') },
      { attended: true, left_at: ist('19:04') },
    ];
    expect(sessionWindow(CLASS, rows).minutes).toBe(15);
  });

  it('never runs more than an hour past the booked end', () => {
    const rows = [
      { attended: true, left_at: ist('23:00') },
      { attended: true, left_at: ist('23:00') },
      { attended: true, left_at: ist('23:00') },
    ];
    expect(sessionWindow(CLASS, rows).minutes).toBe(150);
  });
});

describe('presenceOf', () => {
  const window = sessionWindow(CLASS, [
    { attended: true, left_at: ist('20:10') },
    { attended: true, left_at: ist('20:10') },
    { attended: true, left_at: ist('20:10') },
  ]);

  it('counts the minutes inside the class only', () => {
    const p = presenceOf(
      { attended: true, attendance_intervals: [interval('18:55', '20:10')] },
      window,
    );
    expect(p.minutesIn).toBe(70);
    expect(p.lateByMin).toBe(0);
    expect(p.leftEarlyByMin).toBe(0);
    expect(p.timesKnown).toBe(true);
  });

  it('reports joining late and leaving early against the real end', () => {
    const p = presenceOf(
      { attended: true, attendance_intervals: [interval('19:24', '19:45')] },
      window,
    );
    expect(p.minutesIn).toBe(21);
    expect(p.lateByMin).toBe(24);
    expect(p.leftEarlyByMin).toBe(25);
  });

  it('does not call someone early who left when the class ended', () => {
    const p = presenceOf(
      { attended: true, attendance_intervals: [interval('19:02', '20:10')] },
      window,
    );
    expect(p.leftEarlyByMin).toBe(0);
  });

  it('adds up gaps of three minutes or more as time stepped out', () => {
    const p = presenceOf(
      {
        attended: true,
        attendance_intervals: [interval('19:04', '19:37'), interval('19:56', '20:10')],
      },
      window,
    );
    expect(p.outMin).toBe(19);
    expect(p.minutesIn).toBe(47);
  });

  it('ignores a reconnect shorter than three minutes', () => {
    const p = presenceOf(
      {
        attended: true,
        attendance_intervals: [interval('19:02', '20:02'), interval('20:04', '20:10')],
      },
      window,
    );
    expect(p.outMin).toBe(0);
  });

  it('treats a row with only joined_at and left_at as one segment', () => {
    const p = presenceOf(
      { attended: true, joined_at: ist('19:02'), left_at: ist('20:10'), attendance_intervals: null },
      window,
    );
    expect(p.minutesIn).toBe(68);
    expect(p.outMin).toBe(0);
    expect(p.timesKnown).toBe(true);
  });

  it('says times are unknown for a row marked present by hand', () => {
    const p = presenceOf({ attended: true, attendance_intervals: null }, window);
    expect(p.timesKnown).toBe(false);
    expect(p.minutesIn).toBe(0);
    expect(p.lateByMin).toBe(0);
    expect(p.barelyThere).toBe(false);
  });

  it('flags a token appearance as barely there', () => {
    const p = presenceOf(
      { attended: true, attendance_intervals: [interval('19:02', '19:10')] },
      window,
    );
    expect(p.barelyThere).toBe(true);
  });
});

describe('attendanceFlags', () => {
  it('reads straight off the presence', () => {
    const flags = attendanceFlags({
      minutesIn: 21,
      segments: [],
      lateByMin: 24,
      leftEarlyByMin: 25,
      outMin: 0,
      barelyThere: false,
      timesKnown: true,
    });
    expect(flags).toEqual({
      joinedLate: true,
      leftEarly: true,
      droppedMidClass: false,
      barelyAttended: false,
    });
  });
});

describe('registerGroupOf', () => {
  const clean = { minutesIn: 70, segments: [], lateByMin: 0, leftEarlyByMin: 0, outMin: 0, barelyThere: false, timesKnown: true };

  it('puts a student who stayed throughout in the whole group', () => {
    expect(registerGroupOf({ attended: true, presence: clean })).toBe('whole');
  });

  it('puts a student with any flag in partly', () => {
    expect(registerGroupOf({ attended: true, presence: { ...clean, leftEarlyByMin: 25 } })).toBe('partly');
    expect(registerGroupOf({ attended: true, presence: { ...clean, outMin: 19 } })).toBe('partly');
    expect(registerGroupOf({ attended: true, presence: { ...clean, lateByMin: 24 } })).toBe('partly');
  });

  it('keeps a hand-marked student with no times in the whole group', () => {
    expect(registerGroupOf({ attended: true, presence: { ...clean, timesKnown: false, minutesIn: 0 } })).toBe('whole');
  });

  it('lets attendance beat a stale absence row', () => {
    expect(
      registerGroupOf({ attended: true, presence: clean, absence: { reason_code: 'unwell' } }),
    ).toBe('whole');
  });

  it('never counts a student who enrolled after the class as missing', () => {
    expect(registerGroupOf({ attended: false, joinedAfterClass: true })).toBe('joined_later');
    expect(
      registerGroupOf({ attended: false, joinedAfterClass: true, absence: { reason_code: null } }),
    ).toBe('joined_later');
  });

  it('counts a reason, a note, an advance opt out or an excuse as a reason', () => {
    expect(registerGroupOf({ attended: false, absence: { reason_code: 'clash' } })).toBe('reason');
    expect(registerGroupOf({ attended: false, absence: { reason_note: 'had fever' } })).toBe('reason');
    expect(registerGroupOf({ attended: false, rsvp: 'not_attending' })).toBe('reason');
    expect(registerGroupOf({ attended: false, absence: { excused_at: ist('20:00') } })).toBe('reason');
  });

  it('leaves a silent absence in no reason, even once caught up', () => {
    expect(registerGroupOf({ attended: false, absence: { caught_up_at: ist('20:00') } })).toBe('no_reason');
    expect(registerGroupOf({ attended: false })).toBe('no_reason');
  });
});

describe('describePresence', () => {
  it('says what happened in plain words', () => {
    expect(
      describePresence({
        minutesIn: 21,
        segments: [],
        lateByMin: 24,
        leftEarlyByMin: 25,
        outMin: 19,
        barelyThere: false,
        timesKnown: true,
      }),
    ).toBe('Joined 24 min late. Left 25 min early. Stepped out 19 min.');
  });

  it('says nothing for a clean attendance', () => {
    expect(
      describePresence({ minutesIn: 70, segments: [], lateByMin: 0, leftEarlyByMin: 0, outMin: 0, barelyThere: false, timesKnown: true }),
    ).toBe('');
  });

  it('explains a hand-marked row', () => {
    expect(
      describePresence({ minutesIn: 0, segments: [], lateByMin: 0, leftEarlyByMin: 0, outMin: 0, barelyThere: false, timesKnown: false }),
    ).toBe('Marked present by hand, no times.');
  });

  it('mentions barely there on its own, since presenceOf computes it but nothing printed it', () => {
    expect(
      describePresence({ minutesIn: 8, segments: [], lateByMin: 0, leftEarlyByMin: 0, outMin: 0, barelyThere: true, timesKnown: true }),
    ).toBe('Barely there.');
  });

  it('adds barely there after the other flags, not in place of them', () => {
    expect(
      describePresence({ minutesIn: 8, segments: [], lateByMin: 24, leftEarlyByMin: 0, outMin: 0, barelyThere: true, timesKnown: true }),
    ).toBe('Joined 24 min late. Barely there.');
  });
});

describe('the class-insights regression', () => {
  it('does not flag a whole class of students who left when the meeting ended', () => {
    // 15 Sep: booked to 8:30 PM, the room emptied at 8:10. Every one of these
    // students was flagged "left early" before the window was measured.
    const leaves = ['20:03', '20:10', '20:10', '20:10', '20:13'];
    const rows = leaves.map((t) => ({
      attended: true,
      attendance_intervals: [interval('19:03', t)],
      left_at: ist(t),
    }));
    const window = sessionWindow(CLASS, rows);
    const flagged = rows.filter((r) => attendanceFlags(presenceOf(r, window)).leftEarly);
    expect(flagged.length).toBe(0);
  });
});
