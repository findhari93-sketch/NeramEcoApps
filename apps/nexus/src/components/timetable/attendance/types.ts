/**
 * Shapes for the one attendance surface.
 *
 * These were duplicated across AttendanceSheet and ClassAttendanceInsights,
 * which is how the two came to describe the same 28 students with two different
 * vocabularies and go stale against each other. One dialog, one set of types.
 */

import type { DiagnosticStep } from '../DiagnosticsStepList';
import type { RsvpReasonCode } from '@/lib/rsvp-reasons';

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
  absence?: {
    kind: string;
    reason_code: string | null;
    reason_note: string | null;
    reason_source: string | null;
    reason_submitted_at: string | null;
    recording_watched_at: string | null;
    caught_up_at: string | null;
    excused_at: string | null;
  } | null;
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
  rsvp: 'attending' | 'not_attending';
  reason: string | null;
  attended: boolean;
  duration_minutes: number | null;
  joinedLate: boolean;
  leftEarly: boolean;
  droppedMidClass: boolean;
}

/** Analytics tab, from /api/timetable/class-insights. */
export interface Insights {
  class: {
    id: string;
    title: string;
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

export type AttendanceTabKey = 'who' | 'how';

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
  summary: AttendanceSummary;
  sync: SyncState | null;
  insights: Insights | null;
  insightsLoading: boolean;
  /** Set one student present or absent. Saves instantly. */
  onToggle: (studentId: string, attended: boolean) => void;
  onMarkAllPresent: () => void;
  onOpenImport: () => void;
  onNotify: (message: string, severity: 'info' | 'warning' | 'success') => void;
}
