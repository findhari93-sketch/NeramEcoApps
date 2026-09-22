/**
 * The class report, as pad_session_report builds it, and the few rules for
 * showing and exporting it. The page and the CSV both read from here, so a
 * number on screen and the same number in Excel always agree.
 *
 * Scoring (v3.1 section 11): only revealed, graded questions count. A student
 * who was there and did not answer has skipped it, which counts as not correct.
 * A question a student was absent for never counts for or against them.
 */

import type { CsvValue } from '@/lib/csv-export';
import { displayKeys } from './format';
import type { AnswerType, PromptCounts, PromptState, SkipReason } from './types';

export interface ReportPrompt {
  id: string;
  sequence: number;
  label: string | null;
  question_text: string | null;
  /** The picture the teacher pasted, if any. */
  image_url: string | null;
  answer_type: AnswerType;
  option_count: number | null;
  state: PromptState;
  ungraded: boolean;
  correct_keys: string[] | null;
  opened_at: string;
  closed_at: string | null;
  revealed_at: string | null;
  /** Null while the question is still open. */
  counts: PromptCounts | null;
  /** The answers given, counted, once answering has stopped: what the key picker shows. */
  groups: Array<{ value: string; count: number }> | null;
  /** How many gave each reason for not answering, once answering stopped. */
  skips: Partial<Record<SkipReason, number>> | null;
}

/** The reasons for one question as the console words them: "2 can't answer: 1 don't know, 1 need time". */
export function reportSkips(prompt: Pick<ReportPrompt, 'skips'>): { total: number; by_reason: Partial<Record<SkipReason, number>> } | null {
  if (!prompt.skips) return null;
  const total = Object.values(prompt.skips).reduce((sum, n) => sum + (n ?? 0), 0);
  return total > 0 ? { total, by_reason: prompt.skips } : null;
}

export interface ReportStudent {
  student_id: string;
  name: string | null;
  on_roster: boolean;
  answered: number;
  silent: number;
  absent: number;
  correct: number;
  wrong: number;
  skipped: number;
  total_graded: number;
}

export interface SessionReport {
  ok: true;
  session: {
    id: string;
    status: 'live' | 'ended';
    classroom_id: string;
    classroom_name: string | null;
    scheduled_class_id: string | null;
    created_at: string;
    ended_at: string | null;
    enrolled: number;
  };
  prompts: ReportPrompt[];
  students: ReportStudent[];
}

/** "75%", or an empty string when nothing was graded for this student. */
export function scorePercent(student: Pick<ReportStudent, 'correct' | 'total_graded'>): string {
  if (student.total_graded <= 0) return '';
  return `${Math.round((student.correct / student.total_graded) * 100)}%`;
}

/** What a question ended as: its key, a poll, or why it has none. */
export function promptOutcome(prompt: Pick<ReportPrompt, 'state' | 'ungraded' | 'answer_type' | 'correct_keys'>): string {
  if (prompt.state === 'open') return 'Still open';
  if (prompt.state === 'closed') return 'Answer not set yet';
  if (prompt.ungraded) return 'Poll';
  return displayKeys(prompt.answer_type, prompt.correct_keys);
}

export interface ReportTotals {
  asked: number;
  graded: number;
  polls: number;
  unrevealed: number;
  /** Correct out of graded answers across the class list, or empty before anything is graded. */
  classScore: string;
}

export function reportTotals(report: Pick<SessionReport, 'prompts' | 'students'>): ReportTotals {
  const asked = report.prompts.length;
  const graded = report.prompts.filter((prompt) => prompt.state === 'revealed' && !prompt.ungraded).length;
  const polls = report.prompts.filter((prompt) => prompt.state === 'revealed' && prompt.ungraded).length;

  const roster = report.students.filter((student) => student.on_roster);
  const correct = roster.reduce((sum, student) => sum + student.correct, 0);
  const judged = roster.reduce((sum, student) => sum + student.total_graded, 0);

  return { asked, graded, polls, unrevealed: asked - graded - polls, classScore: scorePercent({ correct, total_graded: judged }) };
}

export const REPORT_CSV_HEADERS = [
  'Student',
  'On class list',
  'Answered',
  'Present but silent',
  'Absent',
  'Correct',
  'Wrong',
  'Skipped',
  'Graded questions',
  'Score',
];

export function reportCsvRows(report: Pick<SessionReport, 'students'>): CsvValue[][] {
  return report.students.map((student) => [
    student.name ?? 'Unnamed student',
    student.on_roster ? 'Yes' : 'No',
    student.answered,
    student.silent,
    student.absent,
    student.correct,
    student.wrong,
    student.skipped,
    student.total_graded,
    scorePercent(student),
  ]);
}

/** The class date as India sees it, YYYY-MM-DD. */
export function istDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

/** answer-pad-nata-evening-batch-2026-09-10.csv */
export function reportFilename(report: Pick<SessionReport, 'session'>): string {
  const slug = (report.session.classroom_name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `answer-pad-${slug || 'class'}-${istDay(report.session.created_at)}.csv`;
}

export function reportErrorMessage(status: number, code: string | null | undefined): string {
  if (code === 'NOT_SESSION_TEACHER') return 'Only the teacher who ran this class can see its report.';
  if (status === 401) return 'Your sign in has expired. Reload the page to sign in again.';
  if (status === 404) return 'This Answer Pad session could not be found.';
  return 'The report could not load. Please try again.';
}
