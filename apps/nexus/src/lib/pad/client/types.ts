/**
 * The snapshot shapes the pad screens render, exactly as the pad_* functions
 * build them (pad_student_snapshot, pad_teacher_snapshot, pad_participation).
 */

export type PromptState = 'open' | 'closed' | 'revealed';
export type SkipReason = 'dont_know' | 'cant_see' | 'need_time' | 'tech_problem' | 'other';
export type AnswerType = 'mcq' | 'numeric' | 'text' | 'yesno';
/** The teacher's decision on a reason: approved excuses the student from the question. */
export type SkipApproval = 'approved' | 'rejected';

/**
 * A question bank question as students may see it (pad_qb_view): never its
 * answer. solution is filled for the teacher once the question is revealed.
 */
export interface QBQuestionView {
  format: string;
  text: string | null;
  image_url: string | null;
  options: Array<{ text: string | null; image_url: string | null }>;
  solution: { explanation: string | null; image_url: string | null } | null;
}

export interface StudentScore {
  correct: number;
  wrong: number;
  skipped: number;
  /** Questions the teacher excused (an accepted reason): counted neither for nor against. */
  excused?: number;
  absent: number;
  total_graded: number;
}

export interface StudentPrompt {
  id: string;
  sequence: number;
  /** The teacher's reference ("38" for Q.38); read it through promptTitle(). */
  label: string | null;
  /** The question as typed or dictated, when the teacher gave one. */
  question_text: string | null;
  /** A picture of the question, usually a snip of the paper. */
  image_url: string | null;
  /** Multiple choice only: one entry per option, null where the teacher left it blank. */
  option_texts: Array<string | null> | null;
  answer_type: AnswerType;
  option_count: number | null;
  state: PromptState;
  version: number;
  /** Null until REVEAL. */
  ungraded: boolean | null;
  /** Null until REVEAL. */
  correct_keys: string[] | null;
  /** When answers stop, on the server's clock (read against server_time); null for no timer. */
  closes_at?: string | null;
  time_limit_s?: number | null;
  /** The question bank question asked from Present to class; null otherwise. */
  qb?: QBQuestionView | null;
}

export interface StudentSnapshot {
  ok: true;
  role: 'student';
  server_time: string;
  session: {
    id: string;
    status: 'live' | 'ended';
    hint_topic: string;
    classroom_name: string | null;
    /** Round 1, Round 2 of this class. */
    round_no?: number | null;
    /** When the teacher published this round's results; null until then. */
    results_published_at?: string | null;
    /** Once this round has ended: the round that followed it in the same class, if one is running. */
    next_session_id?: string | null;
  };
  prompt: StudentPrompt | null;
  my_response: {
    answer: string;
    raw_answer: string;
    responded_at: string;
    /** How many times they changed it while the question was open. */
    change_count?: number;
    is_correct: boolean | null;
  } | null;
  /** "I can't answer", and why, for the current question. Null once an answer is given. */
  my_skip: { reason: SkipReason; note: string | null; approval?: SkipApproval | null } | null;
  /** When the teacher last nudged this student on the open question. Null once they answered or said why. */
  nudged_at: string | null;
  score: StudentScore;
  /** This read closed a question whose time was up. */
  auto_closed?: boolean;
}

export interface TeacherPrompt {
  id: string;
  sequence: number;
  answer_type: AnswerType;
  option_count: number | null;
  state: PromptState;
  version: number;
  correct_keys: string[] | null;
  ungraded: boolean;
  label: string | null;
  question_text: string | null;
  image_url: string | null;
  option_texts: Array<string | null> | null;
  opened_at: string;
  closed_at: string | null;
  revealed_at: string | null;
  answered_count: number;
  /** When the teacher last pressed Nudge on this question. */
  last_nudged_at: string | null;
  /** When answers stop, on the server's clock; null for no timer. */
  closes_at?: string | null;
  time_limit_s?: number | null;
  /** Asked from Present to class: the question bank question, its answer from the bank, and its content. */
  qb_question_id?: string | null;
  suggested_keys?: string[] | null;
  qb?: QBQuestionView | null;
}

export interface PromptCounts {
  enrolled: number;
  answered: number;
  silent: number;
  absent: number;
  correct: number;
  incorrect: number;
  answered_off_roster: number;
  excused?: number;
  /** Students who opened the pad this round (never drops, never staff): the live denominator. */
  joined?: number;
  answered_joined?: number;
  excused_joined?: number;
}

/** A student who joined this round and has not answered the newest question. Teacher only. */
export interface WaitingStudent {
  student_id: string;
  name: string | null;
  reason: SkipReason | null;
  note: string | null;
  approval: SkipApproval | null;
  nudged_at: string | null;
  /** Their pad reported in within the last 90 seconds. */
  pad_open: boolean;
}

export interface PersonRef {
  student_id: string;
  name: string | null;
}

export interface HistoryEntry {
  id: string;
  sequence: number;
  label: string | null;
  answer_type: AnswerType;
  option_count: number | null;
  state: PromptState;
  ungraded: boolean;
  correct_keys: string[] | null;
  opened_at: string;
  answered: number;
  correct: number;
  qb_question_id?: string | null;
  /** The question bank's answer for a question asked from Present to class. Teacher only. */
  suggested_keys?: string[] | null;
}

export interface TeacherSnapshot {
  ok: true;
  role: 'teacher';
  server_time: string;
  session: {
    id: string;
    status: 'live' | 'ended';
    room_code: string;
    hint_topic: string;
    teacher_topic: string;
    classroom_id: string;
    classroom_name: string | null;
    scheduled_class_id: string | null;
    batch_id: string | null;
    meeting_id: string | null;
    created_at: string;
    ended_at: string | null;
    presence_basis: 'app' | 'meeting';
    bot_in_meeting: boolean;
    round_no?: number | null;
    results_published_at?: string | null;
  };
  readiness: { enrolled: number; joined?: number; connected: number; in_meeting: number };
  /** Who opened the pad this round, and who on the class list has not. Teacher only. */
  people?: { joined: PersonRef[]; not_joined: PersonRef[] };
  /** Who joined and has not answered the newest question (open or closed), with any reason. Teacher only. */
  waiting?: WaitingStudent[];
  prompt: TeacherPrompt | null;
  counts: PromptCounts | null;
  groups: Array<{ value: string; count: number }>;
  /** Reasons given on the current question, counted; `approved` of them excused by the teacher. Names are in `waiting`. */
  skips: { total: number; by_reason: Partial<Record<SkipReason, number>>; approved?: number };
  history: HistoryEntry[];
  /** This read closed a question whose time was up. */
  auto_closed?: boolean;
}

export interface ParticipationRow {
  student_id: string;
  name: string | null;
  on_roster: boolean;
  participation: 'answered' | 'excused' | 'silent' | 'absent';
  result: 'correct' | 'incorrect' | 'ungraded' | null;
  answer: string | null;
  joined_mid_prompt: boolean;
  /** Why they did not answer, when they said. */
  skip_reason?: SkipReason | null;
  skip_note?: string | null;
  skip_approval?: SkipApproval | null;
  nudged?: boolean;
}
