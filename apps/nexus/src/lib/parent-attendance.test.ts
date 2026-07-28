import { describe, it, expect } from 'vitest';
import {
  buildClassAttendanceViews,
  summarise,
  describeAttendance,
  type ScheduledClassRow,
  type AttendanceRow,
} from './parent-attendance';
import { LATE_THRESHOLD_MINUTES } from './class-absences';

/** A 6:00pm-7:30pm IST class on the given date. */
function cls(id: string, date = '2026-07-22'): ScheduledClassRow {
  return {
    id,
    title: `Class ${id}`,
    scheduled_date: date,
    start_time: '18:00:00',
    end_time: '19:30:00',
  };
}

/** An ISO timestamp `minutes` after the class start (18:00 IST = 12:30 UTC). */
function afterStart(minutes: number): string {
  return new Date(Date.parse('2026-07-22T18:00:00+05:30') + minutes * 60_000).toISOString();
}

/** An ISO timestamp `minutes` before the class end (19:30 IST). */
function beforeEnd(minutes: number): string {
  return new Date(Date.parse('2026-07-22T19:30:00+05:30') - minutes * 60_000).toISOString();
}

function attRow(over: Partial<AttendanceRow> = {}): AttendanceRow {
  return {
    scheduled_class_id: 'c1',
    attended: true,
    joined_at: afterStart(0),
    left_at: beforeEnd(0),
    duration_minutes: 90,
    attendance_intervals: null,
    ...over,
  };
}

describe('the honesty rule', () => {
  it('marks a class with no attendance rows anywhere as not_measured', () => {
    const [view] = buildClassAttendanceViews([cls('c1')], [], new Set());

    expect(view.measurement).toBe('not_measured');
    expect(view.label).toBe('not_recorded');
    // Every derived field must be null, not false and not 0. There is no number
    // to render, and the shape has to say so.
    expect(view.attended).toBeNull();
    expect(view.joinedAt).toBeNull();
    expect(view.leftAt).toBeNull();
    expect(view.durationMinutes).toBeNull();
    expect(view.late).toBeNull();
    expect(view.leftEarly).toBeNull();
    expect(view.droppedMidClass).toBeNull();
    expect(view.segments).toEqual([]);
  });

  it('marks a measured class with no row for THIS student as a real absence', () => {
    // Somebody else attended, so the class was genuinely synced. This student
    // was genuinely absent. That is the case the rule must NOT suppress.
    const [view] = buildClassAttendanceViews([cls('c1')], [], new Set(['c1']));

    expect(view.measurement).toBe('measured');
    expect(view.attended).toBe(false);
    expect(view.label).toBe('missed');
  });

  it('treats a class as measured when this student has a row, even if the caller forgot it', () => {
    // Defensive union: a row for this student proves the class was measured.
    const [view] = buildClassAttendanceViews([cls('c1')], [attRow()], new Set());
    expect(view.measurement).toBe('measured');
    expect(view.attended).toBe(true);
  });

  it('excludes unmeasured classes from every count', () => {
    const views = buildClassAttendanceViews(
      [cls('c1'), cls('c2', '2026-07-23'), cls('c3', '2026-07-24')],
      [attRow({ scheduled_class_id: 'c1' })],
      new Set(['c1', 'c2'])
    );
    const s = summarise(views);

    expect(s.totalClasses).toBe(3);
    expect(s.measuredClasses).toBe(2);
    expect(s.notMeasuredClasses).toBe(1);
    expect(s.attended).toBe(1);
    expect(s.missed).toBe(1); // c2 only. c3 is unknown, not missed.
    expect(s.attendanceRate).toBe(50);
  });

  it('returns attendanceRate null, never 0, when nothing was measured', () => {
    const views = buildClassAttendanceViews([cls('c1'), cls('c2')], [], new Set());
    const s = summarise(views);

    expect(s.measuredClasses).toBe(0);
    // The regression that matters most. A 0 here tells every parent in the
    // school that their child attended nothing.
    expect(s.attendanceRate).toBeNull();
    expect(s.attendanceRate).not.toBe(0);
    expect(s.attended).toBe(0);
    expect(s.missed).toBe(0);
  });

  it('says so in words rather than showing a number', () => {
    const unmeasured = summarise(buildClassAttendanceViews([cls('c1')], [], new Set()));
    expect(describeAttendance(unmeasured)).toMatch(/hasn't been recorded yet/);

    const empty = summarise([]);
    expect(describeAttendance(empty)).toMatch(/No classes scheduled/);

    const measured = summarise(
      buildClassAttendanceViews([cls('c1')], [attRow()], new Set(['c1']))
    );
    expect(describeAttendance(measured)).toBe('Attended 1 of 1 class.');
  });

  it('mentions unmeasured classes alongside the count', () => {
    const views = buildClassAttendanceViews(
      [cls('c1'), cls('c2', '2026-07-23')],
      [attRow({ scheduled_class_id: 'c1' })],
      new Set(['c1'])
    );
    expect(describeAttendance(summarise(views))).toBe(
      'Attended 1 of 1 class. 1 more class has no attendance recorded.'
    );
  });
});

describe('late / left early boundaries', () => {
  it('is not late at exactly the threshold', () => {
    const [view] = buildClassAttendanceViews(
      [cls('c1')],
      [attRow({ joined_at: afterStart(LATE_THRESHOLD_MINUTES) })],
      new Set(['c1'])
    );
    expect(view.late).toBe(false);
    expect(view.label).toBe('attended');
  });

  it('is late one minute past the threshold', () => {
    const [view] = buildClassAttendanceViews(
      [cls('c1')],
      [attRow({ joined_at: afterStart(LATE_THRESHOLD_MINUTES + 1) })],
      new Set(['c1'])
    );
    expect(view.late).toBe(true);
    expect(view.label).toBe('joined_late');
  });

  it('is not left-early at exactly the threshold', () => {
    const [view] = buildClassAttendanceViews(
      [cls('c1')],
      [attRow({ left_at: beforeEnd(LATE_THRESHOLD_MINUTES) })],
      new Set(['c1'])
    );
    expect(view.leftEarly).toBe(false);
  });

  it('is left-early one minute past the threshold', () => {
    const [view] = buildClassAttendanceViews(
      [cls('c1')],
      [attRow({ left_at: beforeEnd(LATE_THRESHOLD_MINUTES + 1) })],
      new Set(['c1'])
    );
    expect(view.leftEarly).toBe(true);
    expect(view.label).toBe('left_early');
  });

  it('never flags late or left-early for a student who did not attend', () => {
    const [view] = buildClassAttendanceViews(
      [cls('c1')],
      [attRow({ attended: false, joined_at: null, left_at: null })],
      new Set(['c1'])
    );
    expect(view.late).toBe(false);
    expect(view.leftEarly).toBe(false);
    expect(view.label).toBe('missed');
  });

  it('parses class times as IST, not as server-local time', () => {
    // On a UTC server, parsing '2026-07-22T18:00:00' without the offset would
    // put the start 5.5 hours later and make an on-time join look 5.5h early.
    const [view] = buildClassAttendanceViews(
      [cls('c1')],
      [attRow({ joined_at: '2026-07-22T12:30:00.000Z' })], // exactly 18:00 IST
      new Set(['c1'])
    );
    expect(view.late).toBe(false);
    expect(view.scheduledMinutes).toBe(90);
  });
});

describe('dropped mid-class', () => {
  it('is false with no interval data', () => {
    const [view] = buildClassAttendanceViews([cls('c1')], [attRow()], new Set(['c1']));
    expect(view.droppedMidClass).toBe(false);
    expect(view.segments).toEqual([]);
  });

  it('is false with a single interval', () => {
    const [view] = buildClassAttendanceViews(
      [cls('c1')],
      [
        attRow({
          attendance_intervals: [
            { joinDateTime: afterStart(0), leaveDateTime: beforeEnd(0), durationInSeconds: 5400 },
          ],
        }),
      ],
      new Set(['c1'])
    );
    expect(view.droppedMidClass).toBe(false);
    expect(view.segments).toHaveLength(1);
    expect(view.segments[0].durationMinutes).toBe(90);
  });

  it('is true with two intervals, and reports both segments', () => {
    const [view] = buildClassAttendanceViews(
      [cls('c1')],
      [
        attRow({
          attendance_intervals: [
            { joinDateTime: afterStart(4), leaveDateTime: afterStart(52), durationInSeconds: 2880 },
            { joinDateTime: afterStart(65), leaveDateTime: afterStart(90), durationInSeconds: 1500 },
          ],
          duration_minutes: 73,
        }),
      ],
      new Set(['c1'])
    );
    expect(view.droppedMidClass).toBe(true);
    expect(view.label).toBe('partly_attended');
    expect(view.segments).toHaveLength(2);
    expect(view.segments[0].durationMinutes).toBe(48);
    expect(view.segments[1].durationMinutes).toBe(25);
  });

  it('sorts segments chronologically regardless of input order', () => {
    const [view] = buildClassAttendanceViews(
      [cls('c1')],
      [
        attRow({
          attendance_intervals: [
            { joinDateTime: afterStart(65), leaveDateTime: afterStart(90) },
            { joinDateTime: afterStart(4), leaveDateTime: afterStart(52) },
          ],
        }),
      ],
      new Set(['c1'])
    );
    expect(view.segments[0].joinedAt).toBe(afterStart(4));
    expect(view.segments[1].joinedAt).toBe(afterStart(65));
  });

  it('ignores junk in the intervals payload without throwing', () => {
    for (const junk of ['not-an-array', {}, [null], [{}], [42], undefined]) {
      const [view] = buildClassAttendanceViews(
        [cls('c1')],
        [attRow({ attendance_intervals: junk })],
        new Set(['c1'])
      );
      expect(view.segments).toEqual([]);
      expect(view.droppedMidClass).toBe(false);
    }
  });
});

describe('labels', () => {
  it('summarises late AND left early as partly attended', () => {
    const [view] = buildClassAttendanceViews(
      [cls('c1')],
      [
        attRow({
          joined_at: afterStart(LATE_THRESHOLD_MINUTES + 5),
          left_at: beforeEnd(LATE_THRESHOLD_MINUTES + 5),
        }),
      ],
      new Set(['c1'])
    );
    expect(view.label).toBe('partly_attended');
  });

  it('distinguishes a missed class that was explained', () => {
    const [view] = buildClassAttendanceViews(
      [cls('c1')],
      [],
      new Set(['c1']),
      [{ scheduled_class_id: 'c1', reason_code: 'unwell', reason_source: 'parent' }]
    );
    expect(view.label).toBe('missed_with_reason');
    expect(view.reasonCode).toBe('unwell');
    expect(view.reasonSource).toBe('parent');
  });

  it('does not let a reason on an unmeasured class imply an absence', () => {
    const [view] = buildClassAttendanceViews(
      [cls('c1')],
      [],
      new Set(),
      [{ scheduled_class_id: 'c1', reason_code: 'unwell' }]
    );
    expect(view.label).toBe('not_recorded');
    expect(view.attended).toBeNull();
  });

  it('counts explained absences separately in the summary', () => {
    const views = buildClassAttendanceViews(
      [cls('c1'), cls('c2', '2026-07-23')],
      [],
      new Set(['c1', 'c2']),
      [{ scheduled_class_id: 'c1', reason_code: 'family' }]
    );
    const s = summarise(views);
    expect(s.missed).toBe(2);
    expect(s.missedWithReason).toBe(1);
  });
});

describe('summarise totals', () => {
  it('sums present minutes across measured classes only', () => {
    const views = buildClassAttendanceViews(
      [cls('c1'), cls('c2', '2026-07-23'), cls('c3', '2026-07-24')],
      [
        attRow({ scheduled_class_id: 'c1', duration_minutes: 90 }),
        attRow({ scheduled_class_id: 'c3', duration_minutes: 45 }),
      ],
      new Set(['c1', 'c2'])
    );
    const s = summarise(views);
    // c3 counts because the student has a row for it (defensive union).
    expect(s.presentMinutes).toBe(135);
  });

  it('handles an empty list without dividing by zero', () => {
    const s = summarise([]);
    expect(s).toMatchObject({
      totalClasses: 0,
      measuredClasses: 0,
      attended: 0,
      attendanceRate: null,
    });
  });

  it('counts late, left-early and dropped independently', () => {
    const views = buildClassAttendanceViews(
      [cls('c1'), cls('c2', '2026-07-23')],
      [
        attRow({ scheduled_class_id: 'c1', joined_at: afterStart(30) }),
        attRow({
          scheduled_class_id: 'c2',
          attendance_intervals: [{ joinDateTime: afterStart(0) }, { joinDateTime: afterStart(60) }],
        }),
      ],
      new Set(['c1', 'c2'])
    );
    const s = summarise(views);
    expect(s.late).toBe(1);
    expect(s.droppedMidClass).toBe(1);
    expect(s.attended).toBe(2);
    expect(s.attendanceRate).toBe(100);
  });
});
