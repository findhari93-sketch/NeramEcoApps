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
  /** nexus_enrollments.current_standard, for the avatar's stage ring. */
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
  /** Which of the five states this student is in. Computed server-side. */
  bucket: AttendanceBucket;
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
  students: StudentInsight[];
}

/**
 * Missed  = who needs chasing, and the actions that chase them.
 * Attended = who came, ranked by how long they actually stayed.
 * Register = the toggles and the repairs, used when Teams got it wrong.
 */
export type AttendanceTabKey = 'missed' | 'attended' | 'register';

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
}
