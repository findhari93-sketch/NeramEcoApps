/**
 * Aintra asks a signed-in student who has never stated an exam year, once and
 * naturally, which year they will write NATA or JEE B.Arch, and saves the
 * answer when a later message gives it. No extra model call: the ask is a line
 * in the system prompt and the answer is read here with plain rules.
 *
 * Pure (no Supabase, no env), so it is unit tested on its own.
 */

import { examSeasonYear, isPlausibleStatedExamYear, parseExamYearAnswer } from '@neram/database/academic-year';

/** Did an assistant turn already ask the question? */
const ASKED_RE = /\b(which|what)\s+year\b[^?]*\b(write|take|appear|sit|attempt|planning)\b|\bexam\s+year\b/i;
/** Does the student's message talk about the exam at all? */
const EXAM_CONTEXT_RE = /\b(nata|jee|b\.?\s?arch|exam|write|writing|appear|appearing|attempt|planning|batch)\b/i;

export function assistantAskedExamYear(modelTexts: string[]): boolean {
  return modelTexts.some((t) => ASKED_RE.test(t || ''));
}

/**
 * The exam year a student's message states, or null.
 *
 * Accepts '2027', 'NATA 2028', '2026-27' (a cohort, which is the 2027 exam), and
 * when the assistant has just asked, 'this year' / 'next year'. Refuses anything
 * ambiguous: two different years, a year outside the plausible range, or a bare
 * number in a message that is not about the exam (for example a fee or a date).
 */
export function extractExamYearAnswer(
  message: string,
  opts: { justAsked: boolean; now?: Date },
): number | null {
  const now = opts.now ?? new Date();
  const text = (message || '').slice(0, 500);
  const found = new Set<number>();

  // Cohort codes first, then remove them so '2026-27' is not also read as 2026.
  const cohortRe = /\b(20\d{2})\s*[-/]\s*(\d{2})\b/g;
  let rest = text;
  for (const m of text.matchAll(cohortRe)) {
    const code = `${m[1]}-${m[2]}`;
    const year = parseExamYearAnswer(code).examYear;
    // Only a real consecutive pair ('2026-27') is a cohort.
    if (year !== null && (Number(m[1]) + 1) % 100 === Number(m[2])) found.add(year);
  }
  rest = rest.replace(cohortRe, ' ');

  for (const m of rest.matchAll(/\b(20\d{2})\b/g)) {
    const parsed = parseExamYearAnswer(Number(m[1])).examYear;
    if (parsed !== null) found.add(parsed);
  }

  if (found.size === 0 && opts.justAsked) {
    if (/\bthis\s+year\b/i.test(text)) found.add(examSeasonYear(now));
    else if (/\bnext\s+year\b/i.test(text)) found.add(examSeasonYear(now) + 1);
  }

  if (found.size !== 1) return null;
  const [year] = [...found];
  if (!isPlausibleStatedExamYear(year, now)) return null;
  if (!opts.justAsked && !EXAM_CONTEXT_RE.test(text)) return null;
  return year;
}

/** The system prompt line that asks, once. */
export const ASK_EXAM_YEAR_PROMPT = `

## STUDENT EXAM YEAR (ask once)
This signed-in student has not told us which year they will write NATA or JEE B.Arch. Early in this conversation, once, and naturally (for example at the end of a helpful answer), ask which year they plan to write the exam, such as ${'{choices}'}. Ask only once. If they skip it or say they are not sure, do not ask again. Never make it a condition for answering.`;

export function askExamYearPrompt(now: Date = new Date()): string {
  const y = examSeasonYear(now);
  return ASK_EXAM_YEAR_PROMPT.replace('{choices}', `${y}, ${y + 1} or ${y + 2}`);
}

export function savedExamYearPrompt(year: number): string {
  return `

## STUDENT EXAM YEAR
The student just told you they will write the exam in ${year}, and it is saved. Acknowledge it in a few words and tailor the timeline to ${year}. Do not ask about the exam year again.`;
}
