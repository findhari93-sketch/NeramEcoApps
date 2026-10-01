/**
 * Round results: the shapes pad_session_results / pad_student_results return,
 * the words for a student's label, and the personal Teams message each student
 * gets when the teacher publishes.
 *
 * Kind wording on purpose: a low score is "Needs practice", never "poor", and a
 * student who hardly answered is told so gently, with what to do next time.
 */

import type { AnswerType } from './client/types';

export type ResultLabel ='strong' | 'good' | 'needs_practice';

export interface RoundStudentRow {
  student_id: string;
  name: string | null;
  on_roster?: boolean;
  correct: number;
  wrong: number;
  /** Not attempted: in the pad for a graded question and gave no answer. */
  no_answer: number;
  excused: number;
  /** Graded questions asked while they were not in the pad. Never counted against them. */
  away: number;
  /** Graded, revealed questions they were present for and not excused. */
  counted: number;
  /** Graded questions answered: correct plus wrong. Attempted plus no_answer is counted. */
  attempted: number;
  answered: number;
  present_for: number;
  score_pct: number | null;
  /** Correct out of attempted; null when nothing was attempted. */
  accuracy_pct: number | null;
  participation_pct: number | null;
  label: ResultLabel | null;
  not_active: boolean;
  /** Among everyone who joined the round: most correct first, ties share a rank. */
  rank: number | null;
  /** How many joined the round: the rank is out of this. */
  ranked_of: number;
  /** Student view only: whether they are in the top five shown to everyone. */
  in_top?: boolean;
}

export type QuestionResult = 'right' | 'wrong' | 'not_attempted' | 'excused' | 'away' | 'poll' | 'pending';

/** One question of a published round, as one student sees it. */
export interface RoundQuestionResult {
  prompt_id: string;
  sequence: number;
  label: string | null;
  answer_type: AnswerType;
  your_answer: string | null;
  /** Only for a graded question whose answer is revealed. */
  correct_keys: string[] | null;
  result: QuestionResult;
}

export interface RoundTopRow {
  student_id: string;
  name: string | null;
  rank: number;
  correct: number;
  counted: number;
}

export interface RoundClassTiles {
  questions: number;
  graded: number;
  polls?: number;
  pending_keys?: number;
  joined?: number;
  took_part: number;
  enrolled?: number;
  average_score: number | null;
  average_participation?: number | null;
}

export interface RoundResults {
  session: {
    id: string;
    status: 'live' | 'ended';
    round_no: number | null;
    classroom_name: string | null;
    scheduled_class_id: string | null;
    created_at: string;
    ended_at: string | null;
    results_published_at: string | null;
    changed_since_publish: boolean;
  };
  class: RoundClassTiles;
  top: RoundTopRow[];
  students: RoundStudentRow[];
}

export interface StudentRoundResult {
  published: boolean;
  status: 'live' | 'ended';
  round_no: number | null;
  published_at?: string;
  me?: RoundStudentRow | null;
  top?: RoundTopRow[];
  questions?: RoundQuestionResult[];
  class?: RoundClassTiles;
}

export const QUESTION_RESULT_LABELS: Record<QuestionResult, string> = {
  right: 'Right',
  wrong: 'Wrong',
  not_attempted: 'Not attempted',
  excused: 'Excused',
  away: 'Away',
  poll: 'Poll',
  pending: 'Answer not set yet',
};

export const RESULT_LABELS: Record<ResultLabel, string> = {
  strong: 'Strong',
  good: 'Good',
  needs_practice: 'Needs practice',
};

export function roundName(roundNo: number | null | undefined): string {
  return roundNo ? `Round ${roundNo}` : 'This round';
}

/** "12 of 18 correct", or a gentler line when nothing was graded for them. */
export function scoreLine(row: Pick<RoundStudentRow, 'correct' | 'counted'>): string {
  if (row.counted === 0) return 'No graded questions for you in this round';
  return `${row.correct} of ${row.counted} correct`;
}

/** "7 of 22", or null when the round has no rank for them. */
export function rankLine(row: Pick<RoundStudentRow, 'rank' | 'ranked_of'>): string | null {
  if (!row.rank || !row.ranked_of) return null;
  return `${row.rank} of ${row.ranked_of}`;
}

/** "11 of 14": right out of attempted. */
export function rightLine(row: Pick<RoundStudentRow, 'correct' | 'attempted'>): string {
  return row.attempted > 0 ? `${row.correct} of ${row.attempted}` : '0';
}

/** "79% of your attempts were right", or null when nothing was attempted. */
export function accuracyLine(row: Pick<RoundStudentRow, 'attempted' | 'accuracy_pct'>): string | null {
  if (row.attempted <= 0 || row.accuracy_pct === null) return null;
  return `${row.accuracy_pct}% of your attempts were right`;
}

/** What counted for them, and what was left out in their favour. */
export function countedLine(row: Pick<RoundStudentRow, 'counted' | 'away' | 'excused'>): string {
  const parts = [`${row.counted} ${row.counted === 1 ? 'question' : 'questions'} counted for you.`];
  if (row.away > 0) parts.push(`${row.away} asked while you were away ${row.away === 1 ? "doesn't" : "don't"} count.`);
  if (row.excused > 0) parts.push(`${row.excused} excused by your teacher.`);
  return parts.join(' ');
}

export function activityLine(row: Pick<RoundStudentRow, 'answered' | 'present_for' | 'not_active'>): string {
  if (row.present_for === 0) return 'You were not in the pad for any question.';
  const base = `You answered ${row.answered} of ${row.present_for} questions.`;
  return row.not_active ? `${base} Answer every question next time, a guess is fine.` : base;
}

/**
 * The published result, one message per student. {firstName} is filled by
 * sendNudge; {score} and {activity} come from `personalise`.
 */
export function resultMessage(roundNo: number | null, className: string | null): { subject: string; plain: string } {
  const round = roundName(roundNo);
  const where = className ? ` in ${className}` : '';
  return {
    subject: `Your ${round} result is out`,
    plain: `Hi {firstName}, your Answer Pad result for ${round}${where}: {score}. {activity}`,
  };
}

export function personaliseResults(rows: readonly RoundStudentRow[]): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const row of rows) {
    const label = row.label ? ` (${RESULT_LABELS[row.label]})` : '';
    out[row.student_id] = { score: `${summaryLine(row)}${label}`, activity: activityLine(row) };
  }
  return out;
}

/** "attempted 14 of 18, 11 right, rank 7 of 22": the chat's one line. */
export function summaryLine(row: Pick<RoundStudentRow, 'counted' | 'attempted' | 'correct' | 'rank' | 'ranked_of'>): string {
  if (row.counted === 0) return 'no graded questions for you in this round';
  const rank = rankLine(row);
  return `attempted ${row.attempted} of ${row.counted}, ${row.correct} right${rank ? `, rank ${rank}` : ''}`;
}
