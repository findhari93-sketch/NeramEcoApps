/**
 * One past class and its class-insights payload, shaped like production's
 * 15 Sep 2026 class: seventeen came (three of them late), three said nothing
 * and have not caught up, three told us why (two on declared exam leave) and
 * are still catching up, one caught up, one joined the course afterwards, and
 * a drawing homework twelve of twenty-four have handed in.
 *
 * Served in place of staging, whose E2E classroom has no absences at all.
 */

export const OUTCOME_CLASS_ID = 'e2e-outcome-class';
export const OUTCOME_CLASS_TITLE = 'Basic 3D Shape Composition and Line Practice';

/** Today, for the fixture: the class ran nine days before. */
export const OUTCOME_TODAY = '2026-09-24';

export const outcomeClass = {
  id: OUTCOME_CLASS_ID,
  title: OUTCOME_CLASS_TITLE,
  scheduled_date: '2026-09-15',
  start_time: '19:00:00',
  end_time: '20:30:00',
  status: 'completed',
  kind: 'lecture',
  publish_state: 'published',
  teams_meeting_url: null,
  teams_meeting_join_url: null,
  teams_meeting_id: 'e2e-meeting',
  teams_meeting_scope: 'channel',
  recording_url: 'https://example.com/recording',
  youtube_url: null,
  batch_id: null,
  topic: null,
  teacher: { id: 't', name: 'Test Teacher', avatar_url: null },
  batch: null,
  classroom: null,
  attendance_synced_at: '2026-09-15T15:20:00Z',
};

let n = 0;
function student(name: string, over: Record<string, unknown>) {
  n += 1;
  return {
    id: `outcome-s${n}`,
    name,
    avatar_url: null,
    phone: '9999999999',
    study_stage: 'class_12',
    dormant: false,
    enrolled_at: '2026-06-01T00:00:00Z',
    joinedAfterClass: false,
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
    minutesIn: 0,
    lateByMin: 0,
    leftEarlyByMin: 0,
    outMin: 0,
    segments: [],
    group: 'no_reason',
    absence: {
      id: `outcome-a${n}`,
      kind: 'no_show',
      reason_code: null,
      reason_note: null,
      reason_source: null,
      reason_submitted_at: null,
      recording_watched_at: null,
      caught_up_at: null,
      excused_at: null,
      followup_sent_at: null,
    },
    catchup: {
      status: 'waiting',
      step: 'watch',
      watched: false,
      due_on: null,
      days_left: null,
      overdue: false,
      active: false,
      window_days: 7,
      cleared_after: null,
      progress: 'Not opened',
      stuck: false,
      last_active_at: null,
    },
    days_since_class: 9,
    days_to_catch_up: null,
    recent: { of: 5, missed: 1, unexplained: 0 },
    work: { total: 1, handedIn: 0, late: 0, redo: 0, missing: 1, byAssignment: { hw: 'missing' } },
    ...over,
  };
}

const away = {
  code: 'clash',
  note: null,
  source: 'away',
  said: 'Away 10 Sep to 20 Sep',
  at: null,
  unspecified: false,
  line: 'Exam clash · Away 10 Sep to 20 Sep',
};

const students = [
  student('Hari Heera', {
    followup: 'needs_call',
    bucket: 'missed_no_reason',
    reason_resolved: null,
    recent: { of: 5, missed: 4, unexplained: 3 },
  }),
  student('Anushka Anand', { followup: 'needs_call', bucket: 'missed_no_reason', reason_resolved: null }),
  student('John Raja', { followup: 'needs_call', bucket: 'missed_no_reason', reason_resolved: null }),
  student('Tarun Changulani', { followup: 'catching_up', bucket: 'away', away: true, reason_resolved: away }),
  student('Salai Vanamali', { followup: 'catching_up', bucket: 'away', away: true, reason_resolved: away }),
  student('Pranav Shankar', {
    followup: 'catching_up',
    bucket: 'missed_with_reason',
    reason_resolved: {
      code: 'clash',
      note: null,
      source: 'after_class',
      said: 'Told us afterwards',
      at: '2026-09-23T10:00:00Z',
      unspecified: false,
      line: 'Exam clash · Told us afterwards',
    },
  }),
  student('Sanjay Kumar', {
    followup: 'caught_up',
    bucket: 'caught_up',
    reason_resolved: away,
    absence: {
      id: 'outcome-done',
      kind: 'no_show',
      reason_code: null,
      reason_note: null,
      reason_source: null,
      reason_submitted_at: null,
      recording_watched_at: null,
      caught_up_at: '2026-09-17T10:00:00Z',
      excused_at: null,
      followup_sent_at: null,
    },
    work: { total: 1, handedIn: 1, late: 0, redo: 0, missing: 0, byAssignment: { hw: 'in' } },
  }),
  student('Meera Nair', {
    followup: 'late_joiner',
    bucket: 'late_joiner',
    joinedAfterClass: true,
    enrolled_at: '2026-09-20T06:00:00Z',
    reason_resolved: null,
  }),
];
for (let i = 0; i < 17; i++) {
  const handedIn = i < 11;
  students.push(
    student(`Attendee ${i + 1}`, {
      attended: true,
      followup: i < 3 ? 'partly' : 'attended',
      bucket: 'attended',
      group: 'whole',
      absence: null,
      catchup: null,
      reason_resolved: null,
      recent: null,
      duration_minutes: i < 3 ? 25 : 70,
      joinedLate: i < 3,
      work: {
        total: 1,
        handedIn: handedIn ? 1 : 0,
        late: 0,
        redo: 0,
        missing: handedIn ? 0 : 1,
        byAssignment: { hw: handedIn ? 'in' : 'missing' },
      },
    }),
  );
}

export const outcomeInsights = {
  class: {
    id: OUTCOME_CLASS_ID,
    title: OUTCOME_CLASS_TITLE,
    scheduled_date: '2026-09-15',
    start_time: '19:00:00',
    end_time: '20:30:00',
    attendance_synced_at: '2026-09-15T15:20:00Z',
    attendance_sync_status: 'ok',
    attendance_sync_message: null,
    has_meeting: true,
    teams_meeting_id: 'e2e-meeting',
    measured: true,
  },
  summary: {
    rosterSize: 25,
    present: 17,
    absent: 8,
    attendanceRate: 68,
    avgDuration: 62,
    lateCount: 3,
    leftEarlyCount: 0,
    droppedCount: 0,
    barelyAttendedCount: 0,
    scheduledMinutes: 90,
    barelyAttendedCutoff: 23,
    held: { start: '2026-09-15T13:30:00Z', end: '2026-09-15T14:40:00Z', source: 'observed', minutes: 70 },
    missedNoReason: 3,
    missedWithReason: 1,
    caughtUp: 1,
    excused: 0,
    lateJoiners: 1,
    away: 2,
    notCaughtUp: 7,
  },
  followup: {
    tally: {
      attended: 14,
      partly: 3,
      needs_call: 3,
      catching_up: 3,
      waiting_on_us: 0,
      late_joiner: 1,
      caught_up_silent: 0,
      caught_up: 1,
      excused: 0,
      unmeasured: 0,
    },
    missed: 8,
    oldestOpenDays: 9,
    medianDaysToCatchUp: 2,
    saidComing: 22,
  },
  work: [
    {
      id: 'hw',
      title: 'Cube and cylinder line study',
      timing: 'homework',
      expected: 24,
      handedIn: 12,
      late: 1,
      missingCame: 6,
      missingCaughtUp: 0,
      missingCatchingUp: 6,
    },
  ],
  buckets: { attendingAttended: 17, attendingAbsent: 6, declinedAbsent: 0, declinedAttended: 0 },
  reasonTally: {},
  students,
};
