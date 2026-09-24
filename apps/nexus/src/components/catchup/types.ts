/**
 * The shape /api/catchup/overview returns, in one place.
 *
 * Four tabs render from a single fetch, so the payload types live here rather
 * than in whichever tab happened to need them first. If a field is added to the
 * route it is added here, and every tab picks it up.
 */
import type { BucketTally, CatchupBucket } from '@/lib/catchup-buckets';
import type { CatchupStanding } from '@/lib/catchup-standing';
import type { CelebrationInfo } from '@/lib/catchup-celebration';
import type { Diagnosis, StudentDiagnosis } from '@/lib/catchup-diagnosis';
import type { ReasonSource } from '@/lib/absence-reason';

/**
 * `current`, `locked` and `open` are gone.
 *
 * They described a chain: one item open, the rest padlocked behind it. There is
 * no chain now. A student may start any class, and `active` means the one their
 * clock is actually running on.
 */
export type ItemStatus =
  | 'done'
  | 'active'
  | 'waiting'
  | 'excused'
  | 'blocked'
  | 'pending_teacher';

/** How a class stands with respect to its recap. Mirrors `recapStateFor` in the route. */
export type RecapState = 'no_recording' | 'recording_ready' | 'draft' | 'published';

export interface StudentCard {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
}

/** One class one student still owes, or has cleared. */
export interface Item {
  id: string;
  scheduled_class_id: string;
  kind: string;
  status: ItemStatus;
  step: 'watch' | 'assignment' | 'test' | 'done';
  chained: boolean;
  /** Null on everything except the one class this student started. */
  due_on: string | null;
  overdue: boolean;
  /** The clock is running on this one. At most one per student per classroom. */
  active: boolean;
  days_left: number | null;
  /** The one we point the student at. */
  recommended: boolean;
  reason_code: string | null;
  /** What the student typed. Null unless they picked "other" or added detail. */
  reason_note: string | null;
  reason_submitted_at: string | null;
  /** Who said it: 'student' | 'parent' | 'teacher'. Null on rows written before it was stamped. */
  reason_source: string | null;
  /**
   * The one reason for this class, wherever it was given: the RSVP, an away
   * window, or afterwards. `said` is where, in words ("Told us before class").
   * Optional because a payload cached before 2026-10 has none.
   */
  reason?: { code: string; note: string | null; source: ReasonSource; said: string } | null;
  /** The IST day this class's clock started, when it has. */
  activated_on?: string | null;
  /** "40% watched, 2 sittings, last active 5 days ago". */
  progress?: string;
  followup_sent_at: string | null;
  caught_up_at: string | null;
  excuse_note: string | null;
  watched: boolean;
  assignments_outstanding: number;
  assignments_total: number;
  has_test: boolean;
  test_passed: boolean;
  excused: boolean;
  class: { title: string | null; scheduled_date: string };
}

export interface Row {
  journey_id: string | null;
  student: StudentCard;
  /**
   * Why this student is where they are, in one sentence, and the state the
   * tiles filter on. Optional because a cached payload may predate it.
   */
  diagnosis?: StudentDiagnosis;
  /**
   * What is wrong with this student, decided once on the server by
   * `catchupBucket`. The page groups by it and the tiles count it, so the number
   * on a tile and the length of the group under it cannot disagree.
   */
  bucket: CatchupBucket;
  /** Work they can act on right now. Drives the bucket and the owed line. */
  openCount: number;
  /**
   * Items stuck at `blocked` or `pending_teacher`. Nothing the student can do:
   * we owe a recording or an unpublished recap. Counted separately because these
   * never reach the pace denominator, which is why students in this state used
   * to be missing from the screen altogether.
   */
  blockedOnUs: number;
  totals: { total: number; completed: number; blocked: number; pendingTeacher: number };
  missedTotals: {
    total: number;
    completed: number;
    open: number;
    /** 0 or 1: only the running clock can be late. Use `clock.stalled` to chase. */
    overdue: number;
    waiting: number;
  };
  /** The one-clock view, and the replacement chase signal. */
  clock: {
    active: boolean;
    waiting: number;
    overdue: boolean;
    daysLeft: number | null;
    /** Work owed and no clock running on any of it. */
    stalled: boolean;
  };
  pace: { state: 'on_track' | 'behind' | 'done'; deficit: number; remaining: number };
  /**
   * What this student's whole record adds up to. Kept apart from `totals` and
   * `missedTotals` because those two answer "how much work is in each list",
   * where this answers "what should we say about this person": how much of the
   * backlog is genuinely theirs, and whether they have answered a nudge.
   */
  standing: CatchupStanding;
  /**
   * Whether this student has already been congratulated for being all clear.
   * Only set on `all_clear` rows, and null when they never have been. Optional
   * because a payload cached before it existed has no such key.
   */
  celebration?: CelebrationInfo | null;
  items: Item[];
}

export interface Payload {
  classroomId: string | null;
  students: Row[];
  classes: Array<{ id: string; title: string | null; scheduled_date: string }>;
  /** Classes still owed, per reason code, plus `none` for unexplained. */
  reasonTally: Record<string, number>;
  noRecording: Array<{ id: string; title: string | null; scheduled_date: string; affected: number }>;
  pendingRecap: Array<{ id: string; title: string | null; scheduled_date: string; affected: number }>;
  /**
   * The congratulation records could not be read. The wall then pre-selects
   * nobody, because "nobody was congratulated" and "we could not tell" look the
   * same on a row, and guessing the first would re-post everyone.
   */
  celebrationsUnavailable?: boolean;
  totals: {
    studentsBehind: number;
    studentsCatchingUp: number;
    outstanding: number;
    clearedThisMonth: number;
    explained: number;
    unexplained: number;
    /** The tiles read this. A count of the buckets on `students`, nothing else. */
    byBucket: BucketTally;
    /** The tiles read this: students per diagnosis state. */
    byDiagnosis: Record<Diagnosis, number>;
    /**
     * Dormant students who still have open work, excluded from every number
     * above. Stated on the page rather than dropped in silence, so a missing
     * student is explained instead of looking like a bug.
     */
    hiddenDormant: number;
  };
}

export type ItemAction = 'excuse' | 'restore' | 'reset_test';

/** What every tab needs from the page shell to do its job. */
export interface TabProps {
  data: Payload;
  /**
   * The Needs action group filter, when the page owns it (its header tiles set
   * it). Null means every group. Absent, the tab keeps its own.
   */
  bucket?: CatchupBucket | null;
  onBucket?: (next: CatchupBucket | null) => void;
  busy: string | null;
  onAct: (itemId: string, action: ItemAction) => void;
  onNudge: (studentId: string, journeyId: string | null) => void;
  /**
   * Chase a selection in one request. Separate from `onNudge` rather than a
   * widening of it, because the two have different confirmation rules: one
   * student is a button press, many students is an outward-facing send that has
   * to be confirmed and counted first.
   */
  onNudgeMany: (studentIds: string[], journeyIds: string[]) => Promise<void>;
  /** Open the personal-note composer for students who owe nothing. */
  onNote?: (students: Row[]) => void;
  /**
   * Record these students as congratulated without posting anything. For a
   * congratulation that happened outside Nexus, so it is not repeated.
   */
  onMarkCelebrated?: (students: Row[]) => void;
  onReload: () => void;
}
