/**
 * The shape /api/catchup/overview returns, in one place.
 *
 * Four tabs render from a single fetch, so the payload types live here rather
 * than in whichever tab happened to need them first. If a field is added to the
 * route it is added here, and every tab picks it up.
 */
import type { BucketTally, CatchupBucket } from '@/lib/catchup-buckets';

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

/** An item with its student attached, for the feeds that read across students. */
export type FeedRow = Item & { student: StudentCard };

export interface Row {
  journey_id: string | null;
  student: StudentCard;
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
  items: Item[];
}

export interface ClassStat {
  id: string;
  title: string | null;
  scheduled_date: string;
  present: number;
  missed: number;
  caughtUp: number;
  outstanding: number;
  /** Students stuck because we owe a recording or a recap, not because they stalled. */
  blocked: number;
  recap_state: RecapState;
  recap_id: string | null;
  has_transcript: boolean;
  /** Null when there is no Teams meeting, so the attendance panel hides Sync. */
  teams_meeting_id?: string | null;
}

export interface Payload {
  classroomId: string | null;
  students: Row[];
  classes: Array<{ id: string; title: string | null; scheduled_date: string }>;
  classStats: ClassStat[];
  reasons: FeedRow[];
  reasonTally: Record<string, number>;
  completed: FeedRow[];
  noRecording: Array<{ id: string; title: string | null; scheduled_date: string; affected: number }>;
  pendingRecap: Array<{ id: string; title: string | null; scheduled_date: string; affected: number }>;
  totals: {
    studentsBehind: number;
    studentsCatchingUp: number;
    outstanding: number;
    clearedThisMonth: number;
    explained: number;
    unexplained: number;
    /** The tiles read this. A count of the buckets on `students`, nothing else. */
    byBucket: BucketTally;
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
  onReload: () => void;
}
