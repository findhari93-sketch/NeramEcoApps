import { describe, it, expect } from 'vitest';
import {
  DEFAULT_QUESTION_FILTERS,
  PCT_BANDS,
  UNDER_20_RANGE,
  ZERO_RANGE,
  activeFilterCount,
  aiStateOf,
  applyQuestionFilters,
  bandCounts,
  matchesQuestionFilters,
  numberQuestions,
  questionFiltersFromParams,
  questionFiltersToParams,
  quickCounts,
  type FilterableQuestion,
  type QuestionFilters,
} from './question-filters';

/**
 * The Questions tab's filters: a correct-rate range, a floor on answers, and
 * whether an AI has already looked at the question. Asked for so a teacher can
 * pull up "every 0% question nobody has checked", select them all, and send
 * them to an AI in one go.
 */

function q(id: string, over: Partial<FilterableQuestion> = {}): FilterableQuestion {
  return {
    question_id: id,
    question_text: `Question ${id}`,
    sort_order: Number(id.replace(/\D/g, '')) || 0,
    answered: 9,
    correct_pct: 50,
    ai: null,
    ...over,
  };
}

const f = (over: Partial<QuestionFilters> = {}): QuestionFilters => ({
  ...DEFAULT_QUESTION_FILTERS,
  pct: [0, 100],
  ...over,
});

const checked = { checks: 1, fixed: null };
const fixed = { checks: 2, fixed: { fields: ['correct_answer'] } };

describe('matchesQuestionFilters', () => {
  it('passes everything with the defaults, including questions nobody answered', () => {
    expect(matchesQuestionFilters(q('q1', { correct_pct: null, answered: 0 }), f())).toBe(true);
  });

  it('keeps a range inclusive at both ends', () => {
    const range = f({ pct: [10, 30] });
    expect(matchesQuestionFilters(q('q1', { correct_pct: 10 }), range)).toBe(true);
    expect(matchesQuestionFilters(q('q2', { correct_pct: 30 }), range)).toBe(true);
    expect(matchesQuestionFilters(q('q3', { correct_pct: 31 }), range)).toBe(false);
  });

  it('hides a question with no answers as soon as a range is set', () => {
    expect(matchesQuestionFilters(q('q1', { correct_pct: null, answered: 0 }), f({ pct: ZERO_RANGE }))).toBe(false);
  });

  it('reads 0% right as exactly zero, and under 20% as 0 to 19', () => {
    expect(matchesQuestionFilters(q('q1', { correct_pct: 0 }), f({ pct: ZERO_RANGE }))).toBe(true);
    expect(matchesQuestionFilters(q('q2', { correct_pct: 1 }), f({ pct: ZERO_RANGE }))).toBe(false);
    expect(matchesQuestionFilters(q('q3', { correct_pct: 19 }), f({ pct: UNDER_20_RANGE }))).toBe(true);
    expect(matchesQuestionFilters(q('q4', { correct_pct: 20 }), f({ pct: UNDER_20_RANGE }))).toBe(false);
  });

  it('applies a floor on answers', () => {
    expect(matchesQuestionFilters(q('q1', { answered: 4 }), f({ minAnswers: 5 }))).toBe(false);
    expect(matchesQuestionFilters(q('q2', { answered: 5 }), f({ minAnswers: 5 }))).toBe(true);
  });

  it('sorts questions into not checked, checked and fixed, where checked includes fixed', () => {
    const none = q('q1');
    const seen = q('q2', { ai: checked });
    const changed = q('q3', { ai: fixed });

    expect([none, seen, changed].filter((x) => matchesQuestionFilters(x, f({ ai: 'unchecked' })))).toEqual([none]);
    expect([none, seen, changed].filter((x) => matchesQuestionFilters(x, f({ ai: 'checked' })))).toEqual([seen, changed]);
    expect([none, seen, changed].filter((x) => matchesQuestionFilters(x, f({ ai: 'fixed' })))).toEqual([changed]);
  });

  it('combines groups with AND', () => {
    const filters = f({ pct: ZERO_RANGE, ai: 'unchecked', minAnswers: 3 });
    expect(matchesQuestionFilters(q('q1', { correct_pct: 0 }), filters)).toBe(true);
    expect(matchesQuestionFilters(q('q2', { correct_pct: 0, ai: checked }), filters)).toBe(false);
    expect(matchesQuestionFilters(q('q3', { correct_pct: 0, answered: 1 }), filters)).toBe(false);
  });
});

describe('aiStateOf', () => {
  it('calls a check that changed nothing checked, and one that did fixed', () => {
    expect(aiStateOf({ ai: null })).toBe('unchecked');
    expect(aiStateOf({ ai: { checks: 0, fixed: null } })).toBe('unchecked');
    expect(aiStateOf({ ai: checked })).toBe('checked');
    expect(aiStateOf({ ai: fixed })).toBe('fixed');
  });
});

describe('applyQuestionFilters', () => {
  const rows = numberQuestions([
    q('q3', { sort_order: 3, correct_pct: 80, answered: 2 }),
    q('q1', { sort_order: 1, correct_pct: 10, answered: 9, question_text: 'Indus Valley Civilization' }),
    q('q2', { sort_order: 2, correct_pct: null, answered: 0 }),
    q('q4', { sort_order: 4, correct_pct: 10, answered: 12 }),
  ]);

  it('numbers by paper order and never renumbers after filtering', () => {
    const shown = applyQuestionFilters(rows, f({ pct: [0, 20] }));
    expect(shown.map((r) => [r.question_id, r.number])).toEqual([
      ['q1', 1],
      ['q4', 4],
    ]);
  });

  it('finds a question by its words or by its number', () => {
    expect(applyQuestionFilters(rows, f(), 'indus').map((r) => r.question_id)).toEqual(['q1']);
    expect(applyQuestionFilters(rows, f(), '3').map((r) => r.question_id)).toEqual(['q3']);
  });

  it('sorts lowest first with unanswered questions last', () => {
    expect(applyQuestionFilters(rows, f({ sort: 'low' })).map((r) => r.question_id)).toEqual(['q1', 'q4', 'q3', 'q2']);
  });

  it('sorts by most answered', () => {
    expect(applyQuestionFilters(rows, f({ sort: 'answered' })).map((r) => r.question_id)).toEqual(['q4', 'q1', 'q3', 'q2']);
  });
});

describe('bandCounts', () => {
  it('gives 0% its own bar and puts 100% in the last one', () => {
    const counts = bandCounts([q('a', { correct_pct: 0 }), q('b', { correct_pct: 100 }), q('c', { correct_pct: 10 })], f());
    expect(counts).toHaveLength(PCT_BANDS.length);
    expect(counts[0]).toBe(1);
    expect(counts[1]).toBe(1);
    expect(counts[PCT_BANDS.length - 1]).toBe(1);
  });

  it('ignores the current range but respects the other groups', () => {
    const counts = bandCounts(
      [q('a', { correct_pct: 90 }), q('b', { correct_pct: 90, ai: checked }), q('c', { correct_pct: null, answered: 0 })],
      f({ pct: ZERO_RANGE, ai: 'unchecked' }),
    );
    expect(counts.reduce((s, n) => s + n, 0)).toBe(1);
  });
});

describe('quickCounts', () => {
  it('counts what each chip would show on top of the other groups', () => {
    const questions = [
      q('a', { correct_pct: 0 }),
      q('b', { correct_pct: 0, ai: fixed }),
      q('c', { correct_pct: 15 }),
      q('d', { correct_pct: 70, ai: checked }),
    ];
    expect(quickCounts(questions, f())).toEqual({ zero: 2, under20: 3, unchecked: 2, fixed: 1 });
    // With "not checked" already on, the percentage chips count only unchecked questions.
    expect(quickCounts(questions, f({ ai: 'unchecked' }))).toMatchObject({ zero: 1, under20: 2 });
  });
});

describe('activeFilterCount', () => {
  it('counts narrowing groups and leaves sort out', () => {
    expect(activeFilterCount(f())).toBe(0);
    expect(activeFilterCount(f({ sort: 'low' }))).toBe(0);
    expect(activeFilterCount(f({ pct: ZERO_RANGE, minAnswers: 5, ai: 'fixed' }))).toBe(3);
  });
});

describe('the URL', () => {
  const read = (params: Record<string, string>) => questionFiltersFromParams((k) => params[k] ?? null);

  it('round trips every group', () => {
    const filters = f({ pct: [0, 19], minAnswers: 5, ai: 'unchecked', sort: 'low' });
    const params = questionFiltersToParams(filters);
    expect(params).toEqual({ qpct: '0-19', qmin: '5', qai: 'unchecked', qsort: 'low' });
    expect(read(params as Record<string, string>)).toEqual(filters);
  });

  it('keeps a plain view out of the URL entirely', () => {
    expect(questionFiltersToParams(f())).toEqual({ qpct: null, qmin: null, qai: null, qsort: null });
  });

  it('falls back to defaults for anything it cannot read', () => {
    expect(read({ qpct: 'lots', qmin: '7', qai: 'maybe', qsort: 'random' })).toEqual(f());
  });

  it('orders a reversed range and clamps it to 0 to 100', () => {
    expect(read({ qpct: '40-10' }).pct).toEqual([10, 40]);
    expect(read({ qpct: '0-900' }).pct).toEqual([0, 100]);
  });
});
