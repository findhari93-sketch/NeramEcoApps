/**
 * The practice screen's address bar.
 *
 * The page used to rebuild its query string from the filters and the exam,
 * year and session alone, on mount and on every change. Anything else in the
 * link was silently dropped: `shift` and `section` from a paper's Practice
 * button (so a reload practised both sittings of a split paper), the
 * `classroom_id` it was opened for, `paper_source=recalled`, and a `preset`
 * before it had even loaded. Keys this module does not own now pass through
 * untouched, in the order they arrived, so writing the same state twice gives
 * the same string and an effect comparing the two cannot loop.
 *
 * PURE: no React.
 */

import type { QBFilterState } from '@neram/database';
import { serializeQBFilters } from './qb-filter-url';
import { atomIdOf, splitAtomId } from './practice-atoms';

/** The open question. Not `q`, which already carries the search text. */
export const QID_PARAM = 'qid';

/**
 * Which option of an either-or drawing is open.
 *
 * A separate key rather than part of `qid`, so a shared link stays readable
 * and nothing has to be escaped: the two are joined into one id inside the
 * practice session (lib/practice-atoms.ts).
 */
export const PART_PARAM = 'part';

/** Keys rebuilt from page state on every write. Everything else passes through. */
const OWNED = new Set([
  'exam', 'year', 'session', 'cat', 'diff', 'fmt', 'status', 'q', 'topics', 'video',
  QID_PARAM, PART_PARAM,
]);

export interface PracticeUrlState {
  filters: QBFilterState;
  exam: string | null;
  year: number | null;
  session: string | null;
  /** The open question, as an atom id: "<question>" or "<question>~<option>". */
  qid: string | null;
}

/**
 * The query string for this state, without the leading `?`.
 *
 * @param current the query string in the address bar now
 * @param drop passthrough keys to remove, e.g. `preset` once it has been applied
 */
export function buildPracticeQuery(
  current: string | URLSearchParams,
  state: PracticeUrlState,
  drop: string[] = [],
): string {
  const now = typeof current === 'string' ? new URLSearchParams(current) : current;
  const out = new URLSearchParams();

  if (state.exam) out.set('exam', state.exam);
  if (state.year) out.set('year', String(state.year));
  if (state.session) out.set('session', state.session);

  const dropped = new Set(drop);
  now.forEach((value, key) => {
    if (!OWNED.has(key) && !dropped.has(key)) out.append(key, value);
  });

  serializeQBFilters(state.filters).forEach((value, key) => out.set(key, value));
  if (state.qid) {
    const { questionId, partKey } = splitAtomId(state.qid);
    if (questionId) out.set(QID_PARAM, questionId);
    if (partKey) out.set(PART_PARAM, partKey);
  }

  return out.toString();
}

/** The atom id a link points at, from its `qid` and `part`. */
export function readPracticeQid(params: URLSearchParams): string | null {
  const qid = params.get(QID_PARAM);
  if (!qid) return null;
  return atomIdOf(qid, params.get(PART_PARAM));
}
