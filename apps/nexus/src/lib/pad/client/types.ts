/**
 * The snapshot shapes the pad screens render, exactly as the pad_* functions
 * build them (pad_student_snapshot, pad_teacher_snapshot, pad_participation).
 */

export type PromptState = 'open' | 'closed' | 'revealed';
export type SkipReason = 'dont_know' | 'cant_see' | 'need_time' | 'tech_problem' | 'other';
export type AnswerType = 'mcq' | 'numeric' | 'text' | 'yesno';

export interface StudentScore {
  correct: number;
  wrong: number;
  skipped: number;
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
}

export interface StudentSnapshot {
  ok: true;
  role: 'student';
  server_time: string;
  session: { id: string; status: 'live' | 'ended'; hint_topic: string; classroom_name: string | null };
  prompt: StudentPrompt | null;
  my_response: { answer: string; raw_answer: string; responded_at: string; is_correct: boolean | null } | null;
  /** "I can't answer", and why, for the current question. Null once an answer is locked. */
  my_skip: { reason: SkipReason; note: string | null } | null;
  /** When the teacher last nudged this student on the open question. Null once they answered or said why. */
  nudged_at: string | null;
  score: StudentScore;
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
}

export interface PromptCounts {
  enrolled: number;
  answered: number;
  silent: number;
  absent: number;
  correct: number;
  incorrect: number;
  answered_off_roster: number;
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
  };
  readiness: { enrolled: number; connected: number; in_meeting: number };
  prompt: TeacherPrompt | null;
  counts: PromptCounts | null;
  groups: Array<{ value: string; count: number }>;
  /** Students on the list who said why they cannot answer the current question: counts only, never who. */
  skips: { total: number; by_reason: Partial<Record<SkipReason, number>> };
  history: HistoryEntry[];
}

export interface ParticipationRow {
  student_id: string;
  name: string | null;
  on_roster: boolean;
  participation: 'answered' | 'silent' | 'absent';
  result: 'correct' | 'incorrect' | 'ungraded' | null;
  answer: string | null;
  joined_mid_prompt: boolean;
  /** Why they did not answer, when they said (only after the question closed). */
  skip_reason?: SkipReason | null;
  skip_note?: string | null;
}
