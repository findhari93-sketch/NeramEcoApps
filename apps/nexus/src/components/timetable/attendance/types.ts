/**
 * Shapes for the one attendance surface.
 *
 * These were duplicated across AttendanceSheet and ClassAttendanceInsights,
 * which is how the two came to describe the same 28 students with two different
 * vocabularies and go stale against each other. One panel, one set of types.
 */

import type { DiagnosticStep } from '../DiagnosticsStepList';
import type { RsvpReasonCode } from '@/lib/rsvp-reasons';
import type { AttendanceBucket } from '@/lib/attendance-quality';
import type { RegisterGroup } from '@/lib/attendance-register';
import type { FollowupState, FollowupTally } from '@/lib/class-followup';
import type { AssignmentSummary, StudentWork } from '@/lib/class-work';
import type { HomeworkReminderState } from '@/lib/homework-reminders';
import type { RecentAttendance } from '@/lib/recent-attendance';
import type { ReasonSource } from '@/lib/absence-reason';

/** Register tab. One row per enrolled student, from /api/timetable/attendance-report. */
export interface AttendanceRecord {
  id: string;
  student_id: string;
  attended: boolean;
  /** nexus_enrollments.current_standard, display only. */
  study_stage?: string | null;
  joined_at: string | null;
  left_at: string | null;
  duration_minutes: number | null;
  source: string;
  /** Every address this student might have joined Teams under, lowercased. */
  match_emails?: string[];
  student: {
    id: string;
    name: string;
    email: string;
    avatar_url: string | null;
  };
  /**
   * Why they were away and how far they have got with making it up.
   * Null when there is no absence row, the normal case for anyone who turned up.
   */
  absence?: StudentAbsence | null;
}

/**
 * The absence row behind an away student.
 *
 * `id` is the actionable part: /api/catchup/items/[id] takes excuse / restore /
 * reset_test against it, and the per-class nudge stamps followup_sent_at on it.
 */
export interface StudentAbsence {
  id?: string;
  kind: string | null;
  reason_code: string | null;
  reason_note: string | null;
  /** 'student' | 'parent' | 'teacher'. Null on rows written before it was stamped. */
  reason_source: string | null;
  reason_submitted_at: string | null;
  recording_watched_at: string | null;
  caught_up_at: string | null;
  excused_at: string | null;
  /** When somebody last chased them about this class. */
  followup_sent_at?: string | null;
}

/** Why they missed it, resolved from the away window, the RSVP or afterwards. */
export interface InsightReason {
  code: RsvpReasonCode;
  note: string | null;
  source: ReasonSource;
  /** "Told us before class", "Away 10 Sep to 20 Sep". */
  said: string;
  at: string | null;
  /** Declined the RSVP without saying why. */
  unspecified: boolean;
  /** The whole thing in one line: "Exam clash · Away 10 Sep to 20 Sep". */
  line: string;
}

/**
 * The catch-up clock for one student on one class.
 *
 * Everything here is derived, never stored: `status` and `step` come from
 * resolveCatchupBacklog, and the deadline exists only on the class a student has
 * actually started, which is what stops four missed classes rendering as four
 * simultaneous red deadlines.
 */
export interface StudentCatchup {
  /** 'done' | 'active' | 'waiting' | 'excused' | 'blocked' | 'pending_teacher'. */
  status: string;
  /** The one thing standing between them and finishing: watch, assignment, test. */
  step: 'watch' | 'assignment' | 'test' | 'done';
  /** Resolved, so a completed gated recap counts. Not the raw column. */
  watched: boolean;
  /** Only ever set on the class their clock is running on. */
  due_on: string | null;
  days_left: number | null;
  overdue: boolean;
  active: boolean;
  /** How many days they get once they start. Shown before they commit. */
  window_days: number;
  /** "the next day", "28 days later". Null while it is unfinished. */
  cleared_after: string | null;
  /** "40% watched, 2 sittings, last active 5 days ago". */
  progress?: string;
  /** A checkpoint has beaten them twice in a row. */
  stuck?: boolean;
  last_active_at?: string | null;
}

export interface AttendanceSummary {
  present: number;
  absent: number;
  total: number;
  missed: number;
  explained: number;
  caughtUp: number;
}

/** Why the last Teams sync did or did not produce anything. */
export interface SyncState {
  synced_at: string | null;
  status: string | null;
  /** Human explanation, already resolved server-side from the status code. */
  message: string | null;
  has_meeting: boolean;
}

/** The shape /api/timetable/attendance-diagnostics returns. */
export interface DiagnosticsResult {
  ok: boolean;
  blocking_step: string | null;
  steps: DiagnosticStep[];
}

export interface StudentInsight {
  id: string;
  name: string;
  avatar_url: string | null;
  phone?: string | null;
  /** nexus_enrollments.current_standard, for the avatar's info ring. */
  study_stage?: string | null;
  /** nexus_enrollments.participation_status === 'dormant'. Display only. */
  dormant?: boolean;
  enrolled_at?: string | null;
  /** Their enrolment starts after this class ran. Computed server-side. */
  joinedAfterClass?: boolean;
  rsvp: 'attending' | 'not_attending';
  reason: string | null;
  attended: boolean;
  joined_at: string | null;
  left_at: string | null;
  duration_minutes: number | null;
  joinedLate: boolean;
  leftEarly: boolean;
  droppedMidClass: boolean;
  /** Present, but for so little of the class that it is worth a teacher's eye. */
  barelyAttended: boolean;
  absence: StudentAbsence | null;
  /**
   * How far this student has got with making this class up, resolved by the same
   * rules their own screen uses. Null when there is no absence row.
   *
   * Distinct from `absence`, which is the raw table row. The panel must read
   * `catchup.watched` rather than `absence.recording_watched_at`: a student who
   * completed the gated recap never gets that stamp, so the raw column reported
   * the person who did the harder thing as having watched nothing.
   */
  catchup?: StudentCatchup | null;
  /** Which of the seven states this student is in. Computed server-side. */
  bucket: AttendanceBucket;
  /** Minutes inside the class itself, ignoring time before it started. */
  minutesIn: number;
  lateByMin: number;
  leftEarlyByMin: number;
  outMin: number;
  segments: Array<{ start: string; end: string }>;
  /**
   * The register's grouping, imported rather than spelled out again. It was a
   * hand-written copy of the same union, which meant adding a group to the rules
   * module left this type quietly one value short: assignable either way, so the
   * compiler said nothing while the panel and the register disagreed.
   */
  group: RegisterGroup;
  /** A declared away window covers this class's date. Computed server-side. */
  away?: boolean;
  /**
   * That window in the words the student will also see, or null. Composed
   * server-side so the panel, the register and the student's own banner cannot
   * describe the same fortnight three different ways.
   */
  away_window?: string | null;
  /** What is left to do about this class, in one word. See lib/class-followup.ts. */
  followup?: FollowupState;
  /** Resolved reason. Null when they came, or told us nothing anywhere. */
  reason_resolved?: InsightReason | null;
  days_since_class?: number;
  days_to_catch_up?: number | null;
  /** How they have turned up over the last few classes. Missed students only. */
  recent?: RecentAttendance | null;
  /** The class's homework, when it set any. */
  work?: StudentWork | null;
  /** The every-few-days homework reminder, when one was ever started for this student. */
  homeworkReminder?: HomeworkReminderState | null;
}

/** Everything about one class's attendance, from /api/timetable/class-insights. */
export interface Insights {
  class: {
    id: string;
    title: string;
    scheduled_date?: string;
    start_time?: string;
    end_time?: string;
    attendance_synced_at: string | null;
    attendance_sync_status?: string | null;
    attendance_sync_message?: string | null;
    has_meeting: boolean;
    teams_meeting_id: string | null;
    /** Whether Teams attendance has been read for this class at all. False for
     *  a class that ended but has not synced yet, or whose sync failed. */
    measured: boolean;
  };
  summary: {
    rosterSize: number;
    present: number;
    absent: number;
    attendanceRate: number;
    avgDuration: number;
    lateCount: number;
    leftEarlyCount: number;
    droppedCount: number;
    barelyAttendedCount: number;
    scheduledMinutes: number;
    barelyAttendedCutoff: number;
    held: { start: string; end: string; source: 'observed' | 'booked'; minutes: number };
    missedNoReason: number;
    missedWithReason: number;
    caughtUp: number;
    excused: number;
    /** Enrolled after the class ran. Included in notCaughtUp. */
    lateJoiners?: number;
    notCaughtUp: number;
  };
  buckets: {
    attendingAttended: number;
    attendingAbsent: number;
    declinedAbsent: number;
    declinedAttended: number;
  };
  reasonTally: Record<RsvpReasonCode, number>;
  /** The class in one picture. Absent from an older server. */
  followup?: {
    tally: FollowupTally;
    missed: number;
    oldestOpenDays: number | null;
    medianDaysToCatchUp: number | null;
    saidComing: number;
  };
  work?: AssignmentSummary[];
  students: StudentInsight[];
}

/**
 * Missed  = who needs chasing, and the actions that chase them.
 * Attended = who came, ranked by how long they actually stayed.
 * Register = the toggles and the repairs, used when Teams got it wrong.
 */
export type AttendanceTabKey = 'missed' | 'attended' | 'register';

/**
 * What the panel can open narrowed to: one follow-up state, or the students
 * who came (or caught up) and have not handed the class's homework in.
 */
export type AttendanceFilter = FollowupState | 'not_handed_in';

/**
 * The bag the shell builds once and spreads into each tab, following the
 * convention in components/catchup/types.ts. Tabs read; only the shell writes.
 */
export interface AttendanceTabProps {
  classId: string;
  classroomId: string;
  getToken: () => Promise<string | null>;
  loading: boolean;
  /** Blocks the toggles while a sync or a bulk save is in flight. */
  busy: boolean;
  records: AttendanceRecord[];
  /** Register rows are fetched only when that tab is first opened. */
  recordsLoading: boolean;
  summary: AttendanceSummary;
  sync: SyncState | null;
  insights: Insights | null;
  insightsLoading: boolean;
  /**
   * Why the class could not be loaded, when it could not. Read before
   * insightsLoading: SWR reports loading again on every retry, and a tab that only
   * knew "loading" showed skeletons for a failure with nothing to press.
   */
  insightsError: string | null;
  /** True while a retry is in flight. */
  insightsRetrying: boolean;
  onRetryInsights: () => void;
  /** Student ids the teacher has ticked, shared across tabs. */
  selected: Set<string>;
  onSelect: (studentId: string, next: boolean) => void;
  /** Tick or untick a whole group in one gesture. */
  onSelectMany: (studentIds: string[], next: boolean) => void;
  /** Set one student present or absent. Saves instantly. */
  onToggle: (studentId: string, attended: boolean) => void;
  onMarkAllPresent: () => void;
  onOpenImport: () => void;
  onNotify: (message: string, severity: 'info' | 'warning' | 'success') => void;
  /** Open the list already narrowed to one group. */
  initialFilter?: AttendanceFilter | null;
  /** Open the homework reminder for these students (who came and owe it). */
  onRemindHomework?: (studentIds: string[]) => void;
  /** Stop every running homework reminder on this class. */
  onStopHomeworkReminders?: () => void;
  /** A stop is in flight. */
  homeworkBusy?: boolean;
}
