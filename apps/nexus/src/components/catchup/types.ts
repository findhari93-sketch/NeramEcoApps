/**
 * The shape /api/catchup/overview returns, in one place.
 *
 * Four tabs render from a single fetch, so the payload types live here rather
 * than in whichever tab happened to need them first. If a field is added to the
 * route it is added here, and every tab picks it up.
 */

export type ItemStatus =
  | 'done'
  | 'current'
  | 'locked'
  | 'open'
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
  due_on: string | null;
  overdue: boolean;
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
  totals: { total: number; completed: number; blocked: number; pendingTeacher: number };
  missedTotals: { total: number; completed: number; open: number; overdue: number };
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
  };
}

export type ItemAction = 'excuse' | 'restore' | 'reset_test';

/** What every tab needs from the page shell to do its job. */
export interface TabProps {
  data: Payload;
  busy: string | null;
  onAct: (itemId: string, action: ItemAction) => void;
  onNudge: (studentId: string, journeyId: string | null) => void;
  onReload: () => void;
}
