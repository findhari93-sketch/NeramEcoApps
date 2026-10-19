/**
 * When to ask a signed-in student "Which year will you write NATA or JEE B.Arch?"
 *
 * The answer is saved in user_exam_profiles.planning_year. Until it is, the Tools
 * App shows a small bottom sheet. Asking is cheap but nagging is not, so a
 * snooze is remembered server-side in users.metadata.exam_year_prompt (the same
 * account on a phone and a laptop sees one schedule):
 *
 *   "Later" (1st time)      -> ask again after 1 day
 *   "Later" (2nd and on)    -> at most once a week
 *   "Not sure yet"          -> a snooze with a 30 day wait
 *
 * Pure: no Supabase client, safe to import from client components.
 */

export interface ExamYearPromptState {
  dismissed_count: number;
  last_dismissed_at: string | null;
  /** The answer that set the last wait, so a reader can tell the two apart. */
  last_action?: ExamYearSnoozeAction | null;
  /** ISO time before which the sheet stays hidden. */
  snooze_until?: string | null;
}

export type ExamYearSnoozeAction = 'later' | 'not_sure';

const DAY_MS = 24 * 60 * 60 * 1000;
export const EXAM_YEAR_FIRST_SNOOZE_DAYS = 1;
export const EXAM_YEAR_REPEAT_SNOOZE_DAYS = 7;
export const EXAM_YEAR_NOT_SURE_DAYS = 30;

/** Read whatever is stored under metadata.exam_year_prompt, tolerating junk. */
export function readExamYearPromptState(raw: unknown): ExamYearPromptState {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const count = Number(r.dismissed_count);
  const last = typeof r.last_dismissed_at === 'string' ? r.last_dismissed_at : null;
  const until = typeof r.snooze_until === 'string' ? r.snooze_until : null;
  const action = r.last_action === 'later' || r.last_action === 'not_sure' ? r.last_action : null;
  return {
    dismissed_count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0,
    last_dismissed_at: last,
    last_action: action,
    snooze_until: until,
  };
}

/** The new state after a "Later" or "Not sure yet". */
export function snoozeExamYearPrompt(
  prev: ExamYearPromptState,
  action: ExamYearSnoozeAction,
  now: Date = new Date(),
): ExamYearPromptState {
  const dismissed_count = prev.dismissed_count + 1;
  const days =
    action === 'not_sure'
      ? EXAM_YEAR_NOT_SURE_DAYS
      : dismissed_count >= 2
        ? EXAM_YEAR_REPEAT_SNOOZE_DAYS
        : EXAM_YEAR_FIRST_SNOOZE_DAYS;
  return {
    dismissed_count,
    last_dismissed_at: now.toISOString(),
    last_action: action,
    snooze_until: new Date(now.getTime() + days * DAY_MS).toISOString(),
  };
}

/**
 * Whether the sheet may show now. A state without snooze_until (written by an
 * older client, or hand-edited) falls back to the count-based wait from
 * last_dismissed_at, so it can never get stuck hidden or stuck showing.
 */
export function isExamYearPromptDue(state: ExamYearPromptState, now: Date = new Date()): boolean {
  if (state.snooze_until) {
    const until = Date.parse(state.snooze_until);
    if (Number.isFinite(until)) return now.getTime() >= until;
  }
  if (!state.last_dismissed_at || state.dismissed_count === 0) return true;
  const last = Date.parse(state.last_dismissed_at);
  if (!Number.isFinite(last)) return true;
  const days =
    state.last_action === 'not_sure'
      ? EXAM_YEAR_NOT_SURE_DAYS
      : state.dismissed_count >= 2
        ? EXAM_YEAR_REPEAT_SNOOZE_DAYS
        : EXAM_YEAR_FIRST_SNOOZE_DAYS;
  return now.getTime() >= last + days * DAY_MS;
}
