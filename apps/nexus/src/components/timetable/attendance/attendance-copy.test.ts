import { describe, it, expect } from 'vitest';
import { buildMissedList, buildAttendedList } from './attendance-copy';
import type { Insights, StudentInsight } from './types';

function student(over: Partial<StudentInsight>): StudentInsight {
  return {
    id: 's1',
    name: 'Student',
    avatar_url: null,
    phone: null,
    rsvp: 'attending',
    reason: null,
    attended: false,
    joined_at: null,
    left_at: null,
    duration_minutes: null,
    joinedLate: false,
    leftEarly: false,
    droppedMidClass: false,
    barelyAttended: false,
    absence: null,
    bucket: 'missed_no_reason',
    ...over,
  };
}

function insights(students: StudentInsight[]): Insights {
  return {
    class: {
      id: 'c1',
      title: 'JEE Preparation B.Arch',
      scheduled_date: '2026-07-31',
      start_time: '19:00:00',
      end_time: '20:30:00',
      attendance_synced_at: null,
      has_meeting: true,
    },
    summary: {
      rosterSize: students.length,
      present: students.filter((s) => s.attended).length,
      absent: 0,
      attendanceRate: 0,
      avgDuration: 0,
      lateCount: 0,
      leftEarlyCount: 0,
      droppedCount: 0,
      barelyAttendedCount: 0,
      scheduledMinutes: 90,
      barelyAttendedCutoff: 23,
      missedNoReason: 0,
      missedWithReason: 0,
      caughtUp: 0,
      excused: 0,
      notCaughtUp: 0,
    },
    buckets: { attendingAttended: 0, attendingAbsent: 0, declinedAbsent: 0, declinedAttended: 0 },
    reasonTally: {} as Insights['reasonTally'],
    students,
  };
}

describe('buildMissedList', () => {
  const roster = [
    student({ id: 'a', name: 'Abhitha SR Saravanan', bucket: 'missed_no_reason' }),
    student({
      id: 'b',
      name: 'Humaira Safrin',
      bucket: 'missed_with_reason',
      absence: {
        kind: 'opted_out',
        reason_code: 'exam',
        reason_note: null,
        reason_source: 'student',
        reason_submitted_at: '2026-07-30T00:00:00Z',
        recording_watched_at: '2026-08-01T00:00:00Z',
        caught_up_at: null,
        excused_at: null,
      },
    }),
    student({ id: 'c', name: 'Present Person', attended: true, bucket: 'attended' }),
    student({
      id: 'd',
      name: 'Done Already',
      bucket: 'caught_up',
      absence: {
        kind: 'no_show',
        reason_code: null,
        reason_note: null,
        reason_source: null,
        reason_submitted_at: null,
        recording_watched_at: null,
        caught_up_at: '2026-08-01T00:00:00Z',
        excused_at: null,
      },
    }),
  ];

  it('lists only the students who still owe the class', () => {
    const text = buildMissedList(insights(roster));
    expect(text).toContain('Abhitha SR Saravanan');
    expect(text).toContain('Humaira Safrin');
    // Someone who attended, and someone who has finished, are not follow-up work.
    expect(text).not.toContain('Present Person');
    expect(text).not.toContain('Done Already');
  });

  it('keeps the panel groups and numbers across both of them', () => {
    const text = buildMissedList(insights(roster));
    expect(text).toContain('No reason given (1)');
    expect(text).toContain('Told us why (1)');
    expect(text).toMatch(/1\. Abhitha/);
    expect(text).toMatch(/2\. Humaira/);
  });

  it('carries what each one has actually done', () => {
    const text = buildMissedList(insights(roster));
    expect(text).toContain('never joined, recording not watched');
    expect(text).toContain('watched the recording, check not taken');
  });

  it('narrows to a selection when one is given', () => {
    const text = buildMissedList(insights(roster), new Set(['a']));
    expect(text).toContain('Abhitha SR Saravanan');
    expect(text).not.toContain('Humaira Safrin');
  });

  it('says so plainly when nobody is outstanding', () => {
    const text = buildMissedList(insights([roster[2], roster[3]]));
    expect(text).toContain('Everyone has caught up on this class.');
  });

  it('names the class and the date at the top, so a pasted list is not anonymous', () => {
    const text = buildMissedList(insights(roster));
    expect(text.split('\n')[0]).toContain('JEE Preparation B.Arch');
    expect(text.split('\n')[0]).toContain('31 Jul');
  });
});

describe('buildAttendedList', () => {
  it('writes the ranking it is given, with the flags', () => {
    const ranked = [
      student({ id: 'x', name: 'Short Stay', attended: true, duration_minutes: 6, barelyAttended: true, leftEarly: true }),
      student({ id: 'y', name: 'Full Stay', attended: true, duration_minutes: 90 }),
      student({ id: 'z', name: 'Unknown', attended: true, duration_minutes: null }),
    ];
    const text = buildAttendedList(insights(ranked), ranked);
    expect(text).toMatch(/1\. Short Stay, 6m, barely attended, left early/);
    expect(text).toMatch(/2\. Full Stay, 90m/);
    expect(text).toContain('duration not reported');
  });
});
