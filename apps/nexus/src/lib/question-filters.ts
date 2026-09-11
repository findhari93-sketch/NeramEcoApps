/**
 * Which questions the Questions tab shows, and in what order.
 *
 * PURE, like test-result-filters and for the same reason: the chip counts, the
 * histogram bars and the rows behind them come from one predicate. A chip that
 * reads "0% right 3" and then opens onto four questions is worse than no chip,
 * because the teacher acts on the number.
 *
 * Groups combine with AND. Each group holds one choice.
 *
 * The filters live in the URL (qpct, qmin, qai, qsort), so "the questions under
 * 20% that nobody has checked" is a link a teacher can come back to.
 */

export type AiFilter = 'any' | 'unchecked' | 'checked' | 'fixed';
export type QuestionSort = 'paper' | 'low' | 'answered';
export type AiState = 'unchecked' | 'checked' | 'fixed';

export interface QuestionFilters {
  /** Inclusive correct-rate range. [0, 100] filters nothing. */
  pct: [number, number];
  /** Fewest answers a question needs before it is shown. 0 shows all. */
  minAnswers: number;
  ai: AiFilter;
  sort: QuestionSort;
}

export const DEFAULT_QUESTION_FILTERS: QuestionFilters = {
  pct: [0, 100],
  minAnswers: 0,
  ai: 'any',
  sort: 'paper',
};

/**
 * A pool that serves 50 of 150 leaves few answers per question, and "0% right"
 * on one answer is noise, not a finding. Hence a floor to filter on.
 */
export const MIN_ANSWER_CHOICES = [0, 3, 5, 10] as const;

export const AI_FILTERS: AiFilter[] = ['any', 'unchecked', 'checked', 'fixed'];
export const QUESTION_SORTS: QuestionSort[] = ['paper', 'low', 'answered'];

export const AI_FILTER_LABELS: Record<AiFilter, string> = {
  any: 'Any',
  unchecked: 'Not checked',
  checked: 'Checked',
  fixed: 'Fixed by AI',
};

export const SORT_LABELS: Record<QuestionSort, string> = {
  paper: 'Paper order',
  low: 'Lowest first',
  answered: 'Most answered',
};

/** "0% right": nobody who answered got it. */
export const ZERO_RANGE: [number, number] = [0, 0];
/** "Under 20%": the rate at which a question is more likely broken than hard. */
export const UNDER_20_RANGE: [number, number] = [0, 19];

export interface FilterableQuestion {
  question_id: string;
  question_text: string | null;
  sort_order: number;
  answered: number;
  correct_pct: number | null;
  ai?: { checks: number; fixed: unknown } | null;
}

export type NumberedQuestion<T> = T & { number: number };

export function isFullRange(pct: [number, number]): boolean {
  return pct[0] <= 0 && pct[1] >= 100;
}

export function sameRange(a: [number, number], b: [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function aiStateOf(q: Pick<FilterableQuestion, 'ai'>): AiState {
  if (q.ai?.fixed) return 'fixed';
  if ((q.ai?.checks ?? 0) > 0) return 'checked';
  return 'unchecked';
}

/** Paper numbering, fixed by sort order, so filtering never renumbers a question. */
export function numberQuestions<T extends FilterableQuestion>(questions: T[]): NumberedQuestion<T>[] {
  return [...questions]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((q, i) => ({ ...q, number: i + 1 }));
}

/**
 * Whether one question passes every group.
 *
 * A question nobody has answered has no rate to compare, so it only passes a
 * full range. "Under 20%" is a claim about answers, and a question with none
 * makes no claim.
 */
export function matchesQuestionFilters(q: FilterableQuestion, f: QuestionFilters): boolean {
  if (!isFullRange(f.pct)) {
    if (q.correct_pct == null) return false;
    if (q.correct_pct < f.pct[0] || q.correct_pct > f.pct[1]) return false;
  }
  if (f.minAnswers > 0 && (q.answered ?? 0) < f.minAnswers) return false;
  const state = aiStateOf(q);
  if (f.ai === 'unchecked' && state !== 'unchecked') return false;
  // Checked includes fixed: a fix is a check that found something.
  if (f.ai === 'checked' && state === 'unchecked') return false;
  if (f.ai === 'fixed' && state !== 'fixed') return false;
  return true;
}

/** By words in the question, or by its paper number ("12" finds question 12). */
export function matchesQuestionSearch(q: NumberedQuestion<FilterableQuestion>, search: string): boolean {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  if (/^\d+$/.test(term) && q.number === Number(term)) return true;
  return (q.question_text || '').toLowerCase().includes(term);
}

export function sortQuestions<T extends NumberedQuestion<FilterableQuestion>>(
  rows: T[],
  sort: QuestionSort,
): T[] {
  const byNumber = (a: T, b: T) => a.number - b.number;
  if (sort === 'low') {
    return [...rows].sort((a, b) => {
      // Unanswered last: "lowest first" is about answers, and they have none.
      if (a.correct_pct == null && b.correct_pct == null) return byNumber(a, b);
      if (a.correct_pct == null) return 1;
      if (b.correct_pct == null) return -1;
      return a.correct_pct - b.correct_pct || byNumber(a, b);
    });
  }
  if (sort === 'answered') {
    return [...rows].sort((a, b) => (b.answered ?? 0) - (a.answered ?? 0) || byNumber(a, b));
  }
  return [...rows].sort(byNumber);
}

export function applyQuestionFilters<T extends NumberedQuestion<FilterableQuestion>>(
  rows: T[],
  f: QuestionFilters,
  search = '',
): T[] {
  return sortQuestions(
    rows.filter((q) => matchesQuestionFilters(q, f) && matchesQuestionSearch(q, search)),
    f.sort,
  );
}

/** The histogram's bars: 0% on its own, because it is its own finding, then tens. */
export const PCT_BANDS: Array<{ label: string; range: [number, number] }> = [
  { label: '0%', range: [0, 0] },
  ...Array.from({ length: 10 }, (_, i) => ({
    label: `${i * 10 + 1} to ${(i + 1) * 10}%`,
    range: [i * 10 + 1, (i + 1) * 10] as [number, number],
  })),
];

/**
 * How many questions sit in each bar, among those the OTHER groups leave.
 *
 * The current range is ignored on purpose. The histogram is how a teacher picks
 * a range, so it has to show what lies outside the one already picked.
 */
export function bandCounts(questions: FilterableQuestion[], f: QuestionFilters): number[] {
  const counts = PCT_BANDS.map(() => 0);
  const others: QuestionFilters = { ...f, pct: [0, 100] };
  for (const q of questions) {
    const pct = q.correct_pct;
    if (pct == null || !matchesQuestionFilters(q, others)) continue;
    const i = PCT_BANDS.findIndex((b) => pct >= b.range[0] && pct <= b.range[1]);
    if (i >= 0) counts[i] += 1;
  }
  return counts;
}

export interface QuickCounts {
  zero: number;
  under20: number;
  unchecked: number;
  fixed: number;
}

/**
 * What each quick chip would show if pressed, on top of the other groups.
 * Search is left out so the numbers hold still while somebody types.
 */
export function quickCounts(questions: FilterableQuestion[], f: QuestionFilters): QuickCounts {
  const count = (g: QuestionFilters) => questions.filter((q) => matchesQuestionFilters(q, g)).length;
  return {
    zero: count({ ...f, pct: ZERO_RANGE }),
    under20: count({ ...f, pct: UNDER_20_RANGE }),
    unchecked: count({ ...f, ai: 'unchecked' }),
    fixed: count({ ...f, ai: 'fixed' }),
  };
}

/** Groups narrowing the list, for the badge on Filters. Sort is not a filter. */
export function activeFilterCount(f: QuestionFilters): number {
  return (isFullRange(f.pct) ? 0 : 1) + (f.minAnswers > 0 ? 1 : 0) + (f.ai !== 'any' ? 1 : 0);
}

// ---------------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------------

export type QuestionFilterParam = 'qpct' | 'qmin' | 'qai' | 'qsort';

export const QUESTION_FILTER_PARAMS: QuestionFilterParam[] = ['qpct', 'qmin', 'qai', 'qsort'];

/** Only what differs from the default, so a plain view keeps a plain URL. */
export function questionFiltersToParams(f: QuestionFilters): Record<QuestionFilterParam, string | null> {
  return {
    qpct: isFullRange(f.pct) ? null : `${f.pct[0]}-${f.pct[1]}`,
    qmin: f.minAnswers > 0 ? String(f.minAnswers) : null,
    qai: f.ai === 'any' ? null : f.ai,
    qsort: f.sort === 'paper' ? null : f.sort,
  };
}

function clampPct(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Anything unreadable falls back to its default rather than to an empty list. */
export function questionFiltersFromParams(
  get: (key: string) => string | null | undefined,
): QuestionFilters {
  const out: QuestionFilters = { ...DEFAULT_QUESTION_FILTERS, pct: [0, 100] };

  const pct = /^(\d{1,3})-(\d{1,3})$/.exec(get('qpct') || '');
  if (pct) {
    const a = clampPct(Number(pct[1]));
    const b = clampPct(Number(pct[2]));
    out.pct = a <= b ? [a, b] : [b, a];
  }

  const min = Number(get('qmin'));
  if ((MIN_ANSWER_CHOICES as readonly number[]).includes(min)) out.minAnswers = min;

  const ai = get('qai');
  if (ai && (AI_FILTERS as string[]).includes(ai)) out.ai = ai as AiFilter;

  const sort = get('qsort');
  if (sort && (QUESTION_SORTS as string[]).includes(sort)) out.sort = sort as QuestionSort;

  return out;
}
