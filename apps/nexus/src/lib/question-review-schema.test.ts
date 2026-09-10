import { describe, it, expect } from 'vitest';
import {
  REVIEW_CHUNK_SIZE,
  buildQuestionReviewPrompt,
  diffReviewRow,
  reviewChunks,
  validateQuestionReviewJSON,
  type ReviewExportQuestion,
  type ReviewStat,
} from './question-review-schema';

// ---------------------------------------------------------------------------
// Fixtures: the real question that prompted this feature.
// ---------------------------------------------------------------------------

const indus: ReviewExportQuestion = {
  id: 'q-1111111111',
  question_text: 'The Indus Valley Civilization is also known as which of the following?',
  options: [
    { id: 'a', text: 'Copper Age civilization' },
    { id: 'b', text: 'Bronze Age civilization' },
    { id: 'c', text: 'Iron Age civilization' },
    { id: 'd', text: 'Stone Age civilization' },
  ],
  correct_answer: 'a',
  explanation_brief: 'Old note.',
};

const numerical: ReviewExportQuestion = {
  id: 'q-2222222222',
  question_text: 'How many sides does a regular dodecagon have?',
  options: null,
  correct_answer: '12',
  explanation_brief: null,
};

const known = new Map<string, ReviewExportQuestion>([
  [indus.id, indus],
  [numerical.id, numerical],
]);

const stats = new Map<string, ReviewStat>([
  [
    indus.id,
    {
      answered: 9,
      correct: 0,
      correct_pct: 0,
      top_wrong_option: { key: 'b', text: 'Bronze Age civilization', count: 9 },
    },
  ],
]);

const ok = (body: string) => `{"reviews":[${body}]}`;
const FENCE = '```';

// ---------------------------------------------------------------------------
// The prompt
// ---------------------------------------------------------------------------

describe('buildQuestionReviewPrompt', () => {
  it('carries the performance data, which is the whole point', () => {
    const prompt = buildQuestionReviewPrompt([indus], stats);
    expect(prompt).toContain('0 of 9');
    expect(prompt).toContain('Bronze Age civilization');
    // The stored key has to be in there or the AI cannot tell us it is wrong.
    expect(prompt).toContain('"correct_answer":"a"');
  });

  it('sends option ids so a reply can name one', () => {
    const prompt = buildQuestionReviewPrompt([indus], stats);
    expect(prompt).toContain('"id":"a"');
    expect(prompt).toContain('"id":"d"');
  });

  it('survives a question with no stats row', () => {
    const prompt = buildQuestionReviewPrompt([numerical], new Map());
    expect(prompt).toContain('dodecagon');
    expect(prompt).not.toContain('undefined');
  });

  it('names every allowed verdict', () => {
    const prompt = buildQuestionReviewPrompt([indus], stats);
    for (const v of ['wrong_key', 'ambiguous', 'hard_but_fair', 'fine']) {
      expect(prompt).toContain(v);
    }
  });
});

describe('reviewChunks', () => {
  it('splits at the chunk size and keeps every item', () => {
    const items = Array.from({ length: REVIEW_CHUNK_SIZE * 2 + 3 }, (_, i) => i);
    const chunks = reviewChunks(items);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(REVIEW_CHUNK_SIZE);
    expect(chunks[2]).toHaveLength(3);
    expect(chunks.flat()).toEqual(items);
  });

  it('returns nothing for nothing', () => {
    expect(reviewChunks([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Parsing the reply
// ---------------------------------------------------------------------------

describe('validateQuestionReviewJSON: shapes a model actually returns', () => {
  it('reads a fenced reply', () => {
    const raw = `${FENCE}json\n${ok(`{"question_id":"${indus.id}","verdict":"fine","note":"Fine."}`)}\n${FENCE}`;
    const r = validateQuestionReviewJSON(raw, known);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].verdict).toBe('fine');
  });

  it('reads a reply with prose in front of it', () => {
    const raw = `Sure! Here is my analysis:\n\n${ok(
      `{"question_id":"${indus.id}","verdict":"wrong_key","note":"The key is wrong."}`,
    )}`;
    const r = validateQuestionReviewJSON(raw, known);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].verdict).toBe('wrong_key');
  });

  it('reads a bare array', () => {
    const raw = `[{"question_id":"${indus.id}","verdict":"ambiguous","note":"Two options defensible."}]`;
    const r = validateQuestionReviewJSON(raw, known);
    expect(r.rows).toHaveLength(1);
  });

  it('reports unparseable text instead of throwing', () => {
    const r = validateQuestionReviewJSON('I am afraid I cannot help with that.', known);
    expect(r.rows).toEqual([]);
    expect(r.errors.join(' ')).toMatch(/parse/i);
  });
});

describe('validateQuestionReviewJSON: row level guards', () => {
  it('drops a question id that was not in the chunk', () => {
    const raw = ok(`{"question_id":"q-9999999999","verdict":"fine","note":"x"}`);
    const r = validateQuestionReviewJSON(raw, known);
    expect(r.rows).toEqual([]);
    expect(r.errors.join(' ')).toMatch(/not in the/i);
  });

  it('drops a row whose verdict is invented', () => {
    const raw = ok(`{"question_id":"${indus.id}","verdict":"probably_ok","note":"x"}`);
    const r = validateQuestionReviewJSON(raw, known);
    expect(r.rows).toEqual([]);
    expect(r.errors.join(' ')).toMatch(/verdict/i);
  });

  it('keeps the first of a duplicated question and warns', () => {
    const raw = ok(
      `{"question_id":"${indus.id}","verdict":"wrong_key","note":"first"},` +
        `{"question_id":"${indus.id}","verdict":"fine","note":"second"}`,
    );
    const r = validateQuestionReviewJSON(raw, known);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].note).toBe('first');
    expect(r.warnings.join(' ')).toMatch(/duplicate/i);
  });
});

describe('validateQuestionReviewJSON: the tri-state', () => {
  it('omits keys the reply never mentioned, so a partial reply is a patch', () => {
    const raw = ok(
      `{"question_id":"${indus.id}","verdict":"wrong_key","note":"Key is wrong.","correct_answer":"b"}`,
    );
    const r = validateQuestionReviewJSON(raw, known);
    const row = r.rows[0];
    expect(row.correct_answer).toBe('b');
    // Not "undefined": the key must be absent, or a downstream Object.entries
    // walk would write null over a good explanation.
    expect('question_text' in row).toBe(false);
    expect('explanation_brief' in row).toBe(false);
    expect('options' in row).toBe(false);
  });

  it('keeps an explicit null, which means clear it', () => {
    const raw = ok(`{"question_id":"${indus.id}","verdict":"fine","note":"x","explanation_brief":null}`);
    const r = validateQuestionReviewJSON(raw, known);
    expect('explanation_brief' in r.rows[0]).toBe(true);
    expect(r.rows[0].explanation_brief).toBeNull();
  });
});

describe('validateQuestionReviewJSON: correct_answer resolution', () => {
  it('accepts an option id', () => {
    const raw = ok(`{"question_id":"${indus.id}","verdict":"wrong_key","note":"x","correct_answer":"b"}`);
    expect(validateQuestionReviewJSON(raw, known).rows[0].correct_answer).toBe('b');
  });

  it('accepts the printed uppercase label', () => {
    const raw = ok(`{"question_id":"${indus.id}","verdict":"wrong_key","note":"x","correct_answer":"B"}`);
    const r = validateQuestionReviewJSON(raw, known);
    expect(r.rows[0].correct_answer).toBe('b');
  });

  it('resolves the option TEXT, which is what a model usually sends back', () => {
    const raw = ok(
      `{"question_id":"${indus.id}","verdict":"wrong_key","note":"x","correct_answer":"Bronze Age civilization"}`,
    );
    const r = validateQuestionReviewJSON(raw, known);
    expect(r.rows[0].correct_answer).toBe('b');
    expect(r.warnings.join(' ')).toMatch(/matched it to option/i);
  });

  it('resolves a 1-based position', () => {
    const raw = ok(`{"question_id":"${indus.id}","verdict":"wrong_key","note":"x","correct_answer":"2"}`);
    expect(validateQuestionReviewJSON(raw, known).rows[0].correct_answer).toBe('b');
  });

  it('refuses an answer that matches no option, and keeps the rest of the row', () => {
    const raw = ok(
      `{"question_id":"${indus.id}","verdict":"wrong_key","note":"keep me","correct_answer":"Chalcolithic"}`,
    );
    const r = validateQuestionReviewJSON(raw, known);
    expect('correct_answer' in r.rows[0]).toBe(false);
    expect(r.rows[0].note).toBe('keep me');
    expect(r.warnings.join(' ')).toMatch(/no option/i);
  });

  it('takes any non-empty value for a question with no options', () => {
    const raw = ok(`{"question_id":"${numerical.id}","verdict":"wrong_key","note":"x","correct_answer":"12"}`);
    expect(validateQuestionReviewJSON(raw, known).rows[0].correct_answer).toBe('12');
  });
});

describe('validateQuestionReviewJSON: options', () => {
  it('rewrites option text when the ids line up', () => {
    const raw = ok(
      `{"question_id":"${indus.id}","verdict":"ambiguous","note":"x","options":[` +
        `{"id":"a","text":"Copper Age"},{"id":"b","text":"Bronze Age"},` +
        `{"id":"c","text":"Iron Age"},{"id":"d","text":"Stone Age"}]}`,
    );
    const r = validateQuestionReviewJSON(raw, known);
    expect(r.rows[0].options?.map((o) => o.text)).toEqual([
      'Copper Age',
      'Bronze Age',
      'Iron Age',
      'Stone Age',
    ]);
  });

  it('zips id-less options positionally onto the stored ids', () => {
    const raw = ok(
      `{"question_id":"${indus.id}","verdict":"ambiguous","note":"x","options":[` +
        `{"text":"Copper Age"},{"text":"Bronze Age"},{"text":"Iron Age"},{"text":"Stone Age"}]}`,
    );
    const r = validateQuestionReviewJSON(raw, known);
    expect(r.rows[0].options?.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(r.warnings.join(' ')).toMatch(/position/i);
  });

  it('refuses a renumbered options array, which would repoint the stored answer', () => {
    const raw = ok(
      `{"question_id":"${indus.id}","verdict":"ambiguous","note":"x","options":[` +
        `{"id":"1","text":"Copper Age"},{"id":"2","text":"Bronze Age"},` +
        `{"id":"3","text":"Iron Age"},{"id":"4","text":"Stone Age"}]}`,
    );
    const r = validateQuestionReviewJSON(raw, known);
    expect('options' in r.rows[0]).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/ids/i);
  });

  it('refuses an options array of the wrong length', () => {
    const raw = ok(
      `{"question_id":"${indus.id}","verdict":"ambiguous","note":"x","options":[{"id":"a","text":"Only one"}]}`,
    );
    const r = validateQuestionReviewJSON(raw, known);
    expect('options' in r.rows[0]).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/4 options/i);
  });

  it('refuses options on a question that has none', () => {
    const raw = ok(
      `{"question_id":"${numerical.id}","verdict":"fine","note":"x","options":[{"id":"a","text":"12"}]}`,
    );
    const r = validateQuestionReviewJSON(raw, known);
    expect('options' in r.rows[0]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The diff the review step renders
// ---------------------------------------------------------------------------

describe('diffReviewRow', () => {
  it('lists only the fields that actually change', () => {
    const raw = ok(
      `{"question_id":"${indus.id}","verdict":"wrong_key","note":"x","correct_answer":"b",` +
        `"explanation_brief":"Old note."}`,
    );
    const row = validateQuestionReviewJSON(raw, known).rows[0];
    const changes = diffReviewRow(row, indus);
    expect(changes.map((c) => c.field)).toEqual(['correct_answer']);
    expect(changes[0].before).toBe('a');
    expect(changes[0].after).toBe('b');
  });

  it('finds nothing to do for a verdict-only row', () => {
    const raw = ok(`{"question_id":"${indus.id}","verdict":"hard_but_fair","note":"Genuinely hard."}`);
    const row = validateQuestionReviewJSON(raw, known).rows[0];
    expect(diffReviewRow(row, indus)).toEqual([]);
  });

  it('spots a changed option text', () => {
    const raw = ok(
      `{"question_id":"${indus.id}","verdict":"ambiguous","note":"x","options":[` +
        `{"id":"a","text":"Copper Age civilization"},{"id":"b","text":"Bronze Age civilisation"},` +
        `{"id":"c","text":"Iron Age civilization"},{"id":"d","text":"Stone Age civilization"}]}`,
    );
    const row = validateQuestionReviewJSON(raw, known).rows[0];
    expect(diffReviewRow(row, indus).map((c) => c.field)).toEqual(['options']);
  });
});
