import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MCQ_PACK, MCQ_QUESTION, NUM_PACK, NUM_QUESTION, KNOWN_CONCEPTS } from '../../apps/nexus/src/lib/assistant/tutor/testing/fixtures';
import {
  buildPackExportItem,
  buildTutorSystemPrompt,
  chaptersForQuestion,
  checkPackResult,
  collectPackResults,
  packReportRow,
  planPackWrite,
  scoreTutorGold,
  scriptMatchers,
  sha256Hex,
  tutorOutputInstructions,
  type PackSourceQuestion,
} from './qb-tutor-pack';
import { checksumSource } from '../../apps/nexus/src/lib/assistant/tutor/pack';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe('scriptMatchers', () => {
  it('uses the question bank maths reader', () => {
    expect(scriptMatchers.valuesMatch('0.5', '1/2')).toBe(true);
    expect(scriptMatchers.valuesMatch('3.46', '2\\sqrt{3}')).toBe(true);
    expect(scriptMatchers.valuesMatch('2:3', '2:3')).toBe(false);
  });
});

describe('checkPackResult', () => {
  it('marks a good MCQ pack verified, with a stable sha256 checksum', () => {
    const o = checkPackResult('q1', clone(MCQ_PACK), MCQ_QUESTION, KNOWN_CONCEPTS);
    expect(o.status).toBe('verified');
    expect(o.verify_report.ok).toBe(true);
    expect(o.verify_report.errors).toEqual([]);
    expect(o.source_checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(o.source_checksum).toBe(sha256Hex(checksumSource(MCQ_QUESTION)));
    // Same question, same checksum; a key change gives a new one.
    expect(checkPackResult('q1', clone(MCQ_PACK), clone(MCQ_QUESTION), KNOWN_CONCEPTS).source_checksum).toBe(o.source_checksum);
    expect(checkPackResult('q1', clone(MCQ_PACK), { ...MCQ_QUESTION, correct_answer: 'b' }, KNOWN_CONCEPTS).source_checksum).not.toBe(o.source_checksum);
  });

  it('warns (but still verifies) when a wrong MCQ option has no mistake', () => {
    const o = checkPackResult('q1', clone(MCQ_PACK), MCQ_QUESTION, KNOWN_CONCEPTS);
    expect(o.verify_report.warnings).toEqual(['mistakes: wrong option c has no mistake']);
  });

  it('marks a pack whose final disagrees with the key as draft', () => {
    const p = clone(MCQ_PACK);
    p.final.option_id = 'b';
    const o = checkPackResult('q1', p, MCQ_QUESTION, KNOWN_CONCEPTS);
    expect(o.status).toBe('draft');
    expect(o.verify_report.ok).toBe(false);
    expect(o.verify_report.errors.join('\n')).toMatch(/disagrees with the key/);
  });

  it('verifies a numerical pack, drafts one with a wrong value', () => {
    expect(checkPackResult('q2', clone(NUM_PACK), NUM_QUESTION, KNOWN_CONCEPTS).status).toBe('verified');
    const p = clone(NUM_PACK);
    p.final.value = '6';
    expect(checkPackResult('q2', p, NUM_QUESTION, KNOWN_CONCEPTS).status).toBe('draft');
  });

  it('drafts a numerical pack whose mistake trigger is the correct value', () => {
    const p = clone(NUM_PACK);
    p.mistakes.push({ code: 'GUESS', trigger: { value: '5.0' }, step_id: 'n2', explain: 'x' });
    const o = checkPackResult('q2', p, NUM_QUESTION, KNOWN_CONCEPTS);
    expect(o.status).toBe('draft');
    expect(o.verify_report.errors).toContain('mistakes: trigger value 5.0 is the correct answer, not a mistake');
    // A trigger that cannot be read would never fire: a typo there silently loses the mistake, so it blocks.
    const q = clone(NUM_PACK);
    q.mistakes.push({ code: 'GUESS', trigger: { value: 'five' }, step_id: 'n2', explain: 'x' });
    const w = checkPackResult('q2', q, NUM_QUESTION, KNOWN_CONCEPTS);
    expect(w.status).toBe('draft');
    expect(w.verify_report.errors).toContain('mistakes: trigger value five does not parse');
  });

  it('drafts a missing or broken pack instead of throwing', () => {
    const o = checkPackResult('q3', undefined, NUM_QUESTION, KNOWN_CONCEPTS);
    expect(o.status).toBe('draft');
    expect(o.verify_report.errors[0]).toMatch(/not a v1 pack/);
  });

  it('drafts a pack naming a concept that does not exist', () => {
    const p = clone(NUM_PACK);
    p.concepts = [{ slug: 'vector_algebra.unknown', role: 'core' }];
    expect(checkPackResult('q2', p, NUM_QUESTION, KNOWN_CONCEPTS).status).toBe('draft');
  });
});

describe('collectPackResults', () => {
  it('reads objects keyed by question id, and arrays of {question_id, pack}', () => {
    const m = collectPackResults([{ q1: MCQ_PACK, q2: NUM_PACK }, [{ question_id: 'q3', pack: NUM_PACK }], null]);
    expect([...m.keys()].sort()).toEqual(['q1', 'q2', 'q3']);
    expect(m.get('q3')).toEqual(NUM_PACK);
  });
});

describe('report and gold', () => {
  it('a report row has status, error count, first error and step count', () => {
    const p = clone(MCQ_PACK);
    p.final.option_id = 'b';
    const o = checkPackResult('q1', p, MCQ_QUESTION, KNOWN_CONCEPTS);
    const row = packReportRow(o, 'MCQ', 'Find a.b');
    expect(row.slice(0, 6)).toEqual(['q1', 'MCQ', 'draft', 1, 'final: option b disagrees with the key', 2]);
  });

  it('scores gold by verification and, when given, the expected final', () => {
    const ok = checkPackResult('g1', clone(MCQ_PACK), MCQ_QUESTION, KNOWN_CONCEPTS);
    const num = checkPackResult('g2', clone(NUM_PACK), NUM_QUESTION, KNOWN_CONCEPTS);
    const bad = clone(MCQ_PACK);
    bad.final.option_id = 'c';
    const drafted = checkPackResult('g3', bad, MCQ_QUESTION, KNOWN_CONCEPTS);
    const outcomes = new Map([['g1', ok], ['g2', num], ['g3', drafted]]);
    const s = scoreTutorGold(
      [
        { question_id: 'g1', expect_final: 'A' },
        { question_id: 'g2', expect_final: '5.0' },
        { question_id: 'g3', expect_final: 'a' },
        { question_id: 'g4', expect_final: '1' },
      ],
      outcomes,
    );
    expect(s.correct).toBe(2);
    expect(s.total).toBe(4);
    expect(s.misses.map((m) => m.id)).toEqual(['g3', 'g4']);
    expect(s.misses[1].why).toMatch(/no result/);
    // A verified pack whose final is not what the founder expects is a miss.
    expect(scoreTutorGold([{ question_id: 'g2', expect_final: '7' }], outcomes).correct).toBe(0);
  });

  it('the gold fixture is well formed', () => {
    const file = JSON.parse(readFileSync(path.join(__dirname, '../fixtures/qb-tutor-gold.json'), 'utf8'));
    expect(typeof file.note).toBe('string');
    expect(Array.isArray(file.items)).toBe(true);
    expect(new Set(file.items.map((g: { question_id: string }) => g.question_id)).size).toBe(file.items.length);
  });
});

describe('planPackWrite', () => {
  it('a verified pack takes the next version and retires the live one', () => {
    const plan = planPackWrite('verified', 'sum1', [
      { id: 'p1', version: 1, status: 'retired', source_checksum: 'old' },
      { id: 'p2', version: 2, status: 'verified', source_checksum: 'old' },
      { id: 'p3', version: 3, status: 'draft', source_checksum: 'sum1' },
    ]);
    expect(plan).toEqual({ action: 'insert', version: 4, retire: ['p2'] });
  });

  it('a draft is stored alongside and retires nothing', () => {
    expect(planPackWrite('draft', 'sum1', [{ id: 'p2', version: 2, status: 'verified', source_checksum: 'sum1' }])).toEqual({
      action: 'insert',
      version: 3,
      retire: [],
    });
  });

  it('never replaces a teacher-reviewed pack that still matches the question', () => {
    expect(planPackWrite('verified', 'sum1', [{ id: 'p2', version: 2, status: 'reviewed', source_checksum: 'sum1' }])).toMatchObject({ action: 'skip' });
    // A reviewed pack for an edited question no longer serves, so it may be replaced.
    expect(planPackWrite('verified', 'sum2', [{ id: 'p2', version: 2, status: 'reviewed', source_checksum: 'sum1' }])).toEqual({
      action: 'insert',
      version: 3,
      retire: ['p2'],
    });
  });

  it('starts at version 1', () => {
    expect(planPackWrite('verified', 's', [])).toEqual({ action: 'insert', version: 1, retire: [] });
  });
});

describe('export', () => {
  const concepts = [
    { slug: 'vector_algebra.dot_product', label: 'Dot product', chapter: 'vector_algebra', summary: 'Multiply matching parts.' },
    { slug: 'vector_algebra.components', label: 'Components', chapter: 'vector_algebra', summary: null },
    { slug: 'algebra_basics.signed_numbers', label: 'Signed numbers', chapter: 'algebra_basics', summary: null },
    { slug: 'calculus_x.limits', label: 'Limits', chapter: 'calculus_x', summary: null },
    { slug: 'trig.ratios', label: 'Ratios', chapter: 'trig', summary: null },
  ];
  const prereqs: Array<[string, string]> = [
    ['vector_algebra.dot_product', 'vector_algebra.components'],
    ['vector_algebra.components', 'algebra_basics.signed_numbers'],
  ];

  it('offers the primary chapter, also-uses chapters and prerequisite chapters', () => {
    expect(chaptersForQuestion('vector_algebra', ['trig'], concepts, prereqs)).toEqual(['vector_algebra', 'trig', 'algebra_basics']);
  });

  it('builds an export item with the key, the reference working and the concept menu', () => {
    const q: PackSourceQuestion = {
      id: 'q1',
      ...MCQ_QUESTION,
      difficulty: 'EASY',
      explanation_brief: 'Multiply and add.',
      explanation_detailed: 'Step 1 ...',
    };
    const item = buildPackExportItem(q, 'vector_algebra', [], concepts, prereqs);
    expect(item).toMatchObject({
      question_id: 'q1',
      format: 'MCQ',
      correct_answer: 'a',
      difficulty: 'EASY',
      primary_chapter: 'vector_algebra',
      reference_working: { brief: 'Multiply and add.', detailed: 'Step 1 ...' },
    });
    expect(item.concepts.map((c) => c.slug)).toEqual(['vector_algebra.dot_product', 'vector_algebra.components', 'algebra_basics.signed_numbers']);
  });

  it('the system prompt teaches the house rules and embeds a verified example', () => {
    const s = `${buildTutorSystemPrompt()}\n\n${tutorOutputInstructions()}`;
    expect(s).not.toMatch(/—|&mdash;/);
    // "--" may only appear inside the example JSON's LaTeX, never as punctuation; there is none.
    expect(s).not.toMatch(/--/);
    for (const code of ['CONCEPT_MISUNDERSTANDING', 'SIGN_ERROR', 'INCOMPLETE_REASONING']) expect(s).toContain(code);
    expect(s).toContain('"v": 1');
    expect(s).toMatch(/keyed by question id/i);
    // The embedded example must itself pass the checker.
    const json = s.slice(s.indexOf('BEGIN EXAMPLE') + 'BEGIN EXAMPLE'.length, s.indexOf('END EXAMPLE'));
    const example = JSON.parse(json);
    const mcq = checkPackResult('ex', example['<mcq question id>'], MCQ_QUESTION, KNOWN_CONCEPTS);
    expect(mcq.status).toBe('verified');
    // The example practises what it preaches: every wrong option has a mistake.
    expect(mcq.verify_report.warnings).toEqual([]);
    expect(checkPackResult('ex', example['<numerical question id>'], NUM_QUESTION, KNOWN_CONCEPTS).status).toBe('verified');
  });
});
