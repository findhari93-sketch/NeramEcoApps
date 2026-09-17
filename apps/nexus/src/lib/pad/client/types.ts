/**
 * The snapshot shapes the pad screens render, exactly as the pad_* functions
 * build them (pad_student_snapshot, pad_teacher_snapshot, pad_participation).
 */

export type PromptState = 'open' | 'closed' | 'revealed';
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
  opened_at: string;
  closed_at: string | null;
  revealed_at: string | null;
  answered_count: number;
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
  state: PromptState;
  ungraded: boolean;
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
}
