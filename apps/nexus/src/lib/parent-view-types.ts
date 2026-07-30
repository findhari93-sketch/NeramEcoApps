/**
 * The shapes every parent API response and every parent component agree on.
 *
 * WHY A SEPARATE FILE
 * -------------------
 * Two reasons, both practical.
 *
 * 1. Four pages that each declare their own copy of the response shape is four
 *    chances to drift, and the drift is invisible: a page whose local interface
 *    omits a field the API sends still compiles, it just silently never renders
 *    it. That already happened once here, where the Classes page declared
 *    `child` without `classroom_id` while the route had been returning it.
 *
 * 2. This module imports NOTHING that touches the database, so a client
 *    component can import from it without a value import dragging
 *    getSupabaseAdminClient into the browser bundle. parent-classes.ts and
 *    parent-enrollment.ts are server-only; this is the shared vocabulary
 *    between them and the UI.
 *
 * Types only. No functions, no constants that encode policy. Policy lives in
 * the module that owns it.
 */

import type { AttendanceSummary, ClassAttendanceView } from '@/lib/parent-attendance';
import type { AnonymousAggregate } from '@/lib/parent-aggregate';

export type { AttendanceSummary, ClassAttendanceView, AnonymousAggregate };

// ---------------------------------------------------------------------------
// Who
// ---------------------------------------------------------------------------

export interface ParentChildRef {
  id: string;
  name: string | null;
  avatar_url: string | null;
  classroom_id: string;
  classroom_name: string | null;
}

export type EnrollmentNoticeKind = 'dormant' | 'removed' | 'late_joiner';

/**
 * Why this page's numbers look the way they do. Null when the child is simply
 * active. Rides on every parent response so the pages cannot disagree.
 * Built by lib/parent-enrollment.ts.
 */
export interface EnrollmentNotice {
  kind: EnrollmentNoticeKind;
  tone: 'warning' | 'info' | 'neutral';
  headline: string;
  detail: string;
  /** 'YYYY-MM-DD', or null when the underlying column was never set. */
  sinceDate: string | null;
}

// ---------------------------------------------------------------------------
// Status without content
// ---------------------------------------------------------------------------

/**
 * What a parent learns about a class recording: whether one exists, and whether
 * their child has watched it. Never how to watch it.
 *
 * There is deliberately no url field of any kind. Adding one is not a feature
 * request to weigh up, it is a change to what the portal is: parents nudge,
 * students watch. lib/parent-classes.ts enforces this at the select and again
 * at the mapper, and parent-classes.test.ts fails the build if either belt slips.
 */
export interface ParentRecordingStatus {
  available: boolean;
  /**
   * null means the question does not apply, which is the common case: the child
   * attended live, so there is nothing to catch up on. Distinct from false,
   * which means they missed the class and have not watched it yet.
   */
  watchedByChild: boolean | null;
  watchedAt: string | null;
  /**
   * How we know. A published recap makes completing the recap the only proof;
   * 'self_declared' is the legacy path for a class with a bare recording link
   * and no recap to gate on.
   */
  proof: 'recap_completed' | 'self_declared' | null;
}

/** Reference material: how much, never what. */
export interface ParentResourceStatus {
  count: number;
}

// ---------------------------------------------------------------------------
// A class
// ---------------------------------------------------------------------------

/** Derived from the clock, not from `status`, which is not always kept current. */
export type ParentClassPhase = 'upcoming' | 'live' | 'past' | 'cancelled';

/** The at-a-glance badges the calendar renders without opening a class. */
export interface ParentAssignmentBadge {
  total: number;
  doneByChild: number;
}

export interface ParentTestBadge {
  attempted: boolean;
  /** null, never 0, when never attempted. */
  bestPct: number | null;
  passed: boolean | null;
}

export interface ParentCatchupBadge {
  open: boolean;
  caughtUpAt: string | null;
}

export interface ParentClass {
  id: string;
  title: string;
  description: string | null;
  /** 'YYYY-MM-DD' */
  scheduled_date: string;
  /** 'HH:MM:SS' */
  start_time: string;
  end_time: string;
  status: string | null;
  phase: ParentClassPhase;
  teacher: { id: string; name: string | null; avatar_url: string | null } | null;
  topicTitle: string | null;
  classroom: { id: string; name: string; type: string | null } | null;

  recording: ParentRecordingStatus;
  resources: ParentResourceStatus;

  /** Null for a class that has not happened, so a future class is never an absence. */
  attendance: ClassAttendanceView | null;

  assignmentBadge: ParentAssignmentBadge | null;
  testBadge: ParentTestBadge | null;
  catchupBadge: ParentCatchupBadge | null;
}

// ---------------------------------------------------------------------------
// Work and tests
// ---------------------------------------------------------------------------

export type ParentAssignmentBucket = 'needs_doing' | 'waiting_on_teacher' | 'marked';

export interface ParentAssignmentDetail {
  id: string;
  title: string;
  timing: 'prework' | 'homework' | null;
  assignmentType: 'drawing' | 'document' | null;
  instructions: string | null;
  /** 'YYYY-MM-DD', the child's personal deadline where one applies. */
  dueOn: string | null;
  bucket: ParentAssignmentBucket;
  isOverdue: boolean;
  attempt: number;
  evaluationType: 'marks' | 'stars';
  score: number | null;
  maxScore: number | null;
  feedback: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
  /** Null below the privacy floor. See lib/parent-aggregate.ts. */
  aggregate: AnonymousAggregate | null;
}

export type ParentTestKind = 'class_prep' | 'catchup_class' | 'classroom_assignment';

export interface ParentTestDetail {
  testId: string;
  title: string;
  kind: ParentTestKind;
  passingPct: number;
  /** Submitted attempts only. Abandoned rows are not attempts. */
  attempts: number;
  /** null, never 0, when never attempted. */
  bestPct: number | null;
  bestScore: number | null;
  totalMarks: number | null;
  /** null when never attempted. Derived against passingPct, never stored. */
  passed: boolean | null;
  lastAttemptAt: string | null;
  aggregate: AnonymousAggregate | null;
}

/** Where a child stands on a class they missed or joined after. */
export interface ParentCatchupStatus {
  required: boolean;
  kind: 'no_show' | 'opted_out' | 'late_joiner' | null;
  reasonNote: string | null;
  recordingWatched: boolean;
  assignmentsOutstanding: number;
  assignmentsTotal: number;
  testRequired: boolean;
  testPassed: boolean;
  caughtUpAt: string | null;
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export interface ParentTimetableResponse {
  child: ParentChildRef;
  notice: EnrollmentNotice | null;
  window: { start: string; end: string };
  classes: ParentClass[];
  /** Past, non-cancelled classes only. */
  summary: AttendanceSummary;
  attendanceSentence: string;
  /** 'YYYY-MM-DD' keys, for the month grid's dots. */
  markedDates: string[];
  holidays: Record<string, { title: string; description: string | null }>;

  /**
   * Compat fields for the pre-calendar Classes page and the shipped E2E suite.
   * Kept so the honesty invariant test ("unsynced classes are not reported as
   * absences") keeps passing against the same route it was written for.
   */
  windowDays: number;
  upcoming: Array<{
    id: string;
    title: string;
    scheduled_date: string;
    start_time: string;
    end_time: string;
    status: string | null;
  }>;
  recent: ClassAttendanceView[];
}

export interface ParentClassDetailResponse {
  child: ParentChildRef;
  notice: EnrollmentNotice | null;
  cls: ParentClass;
  whatHappened: {
    bullets: string[];
    tags: { id: string; label: string }[];
    imageCount: number;
    images: Array<{
      id: string;
      url: string;
      thumb_url: string | null;
      caption: string | null;
    }>;
  };
  assignments: ParentAssignmentDetail[];
  tests: ParentTestDetail[];
  catchup: ParentCatchupStatus | null;
}
