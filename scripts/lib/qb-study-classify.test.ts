import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildMathSystemPrompt,
  buildQuestionMessage,
  cleanText,
  csvRow,
  scoreGold,
  validateAptitudeResult,
  validateMathResult,
  type GoldItem,
} from './qb-study-classify';

const slugs = new Set(['functions', 'trigonometric_ratios', 'differentiation']);
const refs = new Set(['c11.2.4', 'c11.3']);

describe('validateMathResult', () => {
  it('keeps a good answer and trims what the schema cannot', () => {
    const r = validateMathResult(
      {
        primary_slug: 'functions',
        also_uses: ['functions', 'trigonometric_ratios', 'trigonometric_ratios', 'differentiation', 'bogus'],
        concepts: [
          { name: 'Domain — square roots', why: 'Each root -- must be defined', ncert_ref: 'c11.2.4' },
          { name: 'sin x', why: 'defined everywhere', ncert_ref: 'c99' },
          { name: ' ', why: '', ncert_ref: 'none' },
        ],
        confidence: 1.4,
        rationale: 'Domain question',
      },
      slugs,
      refs,
    )!;
    // Never the primary again, no duplicates, at most two.
    expect(r.also_uses).toEqual(['trigonometric_ratios', 'differentiation']);
    expect(r.concepts).toHaveLength(2);
    // The content rules forbid em dashes and double dashes.
    expect(r.concepts[0].name).toBe('Domain, square roots');
    expect(r.concepts[0].why).toBe('Each root, must be defined');
    expect(r.concepts[1].ncert_ref).toBe('none');
    expect(r.confidence).toBe(1);
  });

  it('rejects an unknown primary chapter', () => {
    expect(validateMathResult({ primary_slug: 'trigonometry', also_uses: [], concepts: [], confidence: 1, rationale: '' }, slugs, refs)).toBeNull();
    expect(validateMathResult(null, slugs, refs)).toBeNull();
  });
});

describe('validateAptitudeResult', () => {
  it('accepts a known section or none, nothing else', () => {
    const ids = new Set(['s1']);
    expect(validateAptitudeResult({ foundation_section_id: 's1', concept_name: 'English bond', why: '', confidence: 0.9, rationale: '' }, ids)?.foundation_section_id).toBe('s1');
    expect(validateAptitudeResult({ foundation_section_id: 'none', concept_name: '', why: '', confidence: 0.9, rationale: '' }, ids)?.foundation_section_id).toBe('none');
    expect(validateAptitudeResult({ foundation_section_id: 's2', concept_name: '', why: '', confidence: 0.9, rationale: '' }, ids)).toBeNull();
  });
});

describe('prompts', () => {
  it('is deterministic, so the cached system prompt is reused', () => {
    const a = buildMathSystemPrompt([{ slug: 'functions', label: 'Functions', group: 'Algebra' }], [{ ref: 'c11.2.4', label: 'Class 11 Ch 2' }]);
    const b = buildMathSystemPrompt([{ slug: 'functions', label: 'Functions', group: 'Algebra' }], [{ ref: 'c11.2.4', label: 'Class 11 Ch 2' }]);
    expect(a).toBe(b);
    expect(a).toContain('- functions: Functions (Algebra)');
    expect(a).not.toMatch(/—|--/);
  });

  it('sends the solution and the current tags, not the broad subject', () => {
    const msg = buildQuestionMessage({
      id: 'q',
      question_text: 'The domain of f(x) = sqrt(2x-3) + sin x',
      options: [{ id: 'a', text: '[3/2, inf)' }],
      correct_answer: 'a',
      explanation_brief: 'Both roots non-negative',
      explanation_detailed: 'Step 1: 2x - 3 >= 0',
      categories: ['mathematics', 'trigonometry'],
    });
    expect(msg).toContain('WORKED SOLUTION\nStep 1');
    expect(msg).toContain('CURRENT TAGS (may be wrong)\ntrigonometry');
  });
});

describe('gold set', () => {
  it('scores accepted alternatives as correct', () => {
    const gold: GoldItem[] = [
      { question_id: 'a', accept: ['functions'] },
      { question_id: 'b', accept: ['determinants', 'properties_of_triangles'] },
      { question_id: 'c', accept: ['heights_and_distances'] },
    ];
    const s = scoreGold(gold, new Map([['a', 'functions'], ['b', 'properties_of_triangles'], ['c', 'trigonometric_ratios']]));
    expect(s.correct).toBe(2);
    expect(s.misses).toEqual([{ id: 'c', expected: ['heights_and_distances'], got: 'trigonometric_ratios' }]);
  });

  it('the fixture is well formed and only names real chapters', () => {
    const gold: GoldItem[] = JSON.parse(readFileSync(path.join(__dirname, '../fixtures/qb-math-gold.json'), 'utf8'));
    const known = new Set([
      'functions', 'differentiation', 'trigonometric_ratios', 'quadratic_equations', 'straight_lines', 'determinants',
      'properties_of_triangles', 'inverse_trigonometry', 'heights_and_distances', 'trigonometric_equations',
      'applications_of_derivatives', 'area_under_curves', 'probability', 'sets_and_relations', 'matrices',
      'complex_numbers', 'circles', 'statistics', 'mean_value_theorems', 'differentiability', 'definite_integrals',
    ]);
    expect(gold.length).toBeGreaterThanOrEqual(20);
    expect(new Set(gold.map((g) => g.question_id)).size).toBe(gold.length);
    for (const g of gold) for (const a of g.accept) expect(known.has(a)).toBe(true);
  });
});

describe('csvRow', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvRow(['a', 'b,c', 'say "hi"', 'x\ny', null])).toBe('a,"b,c","say ""hi""","x\ny",');
  });
});

describe('cleanText', () => {
  it('turns dashes into commas', () => {
    expect(cleanText('Limits – then continuity')).toBe('Limits, then continuity');
  });
});
