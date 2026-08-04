import { describe, it, expect } from 'vitest';
import {
  applyTestOptionMap,
  buildTestOptionMaps,
  displayedToOriginalId,
  originalToDisplayedId,
  permuteOptionIds,
  pickTestDraw,
  testDrawSeed,
  translateDrawnAnswers,
} from './question-draw';
import { gradeQBAnswerStrict } from './question-bank';

/**
 * Serving a different paper every sitting.
 *
 * Two properties carry the whole feature, and the second one is the dangerous
 * half: if a permuted answer is not translated back before grading, every
 * student's correct choice is marked wrong and the marks look plausible enough
 * that nobody would notice for weeks. Most of the cases below are about that.
 */

const POOL = Array.from({ length: 40 }, (_, i) => `q${i + 1}`);
const SEED = testDrawSeed('student-1', 'test-1');

describe('the pool serves a rotating window', () => {
  it('serves exactly the serve count', () => {
    expect(pickTestDraw(POOL, 20, 1, SEED)).toHaveLength(20);
  });

  it('gives a retry an entirely different paper when the pool allows it', () => {
    const first = new Set(pickTestDraw(POOL, 20, 1, SEED));
    const second = pickTestDraw(POOL, 20, 2, SEED);
    // 40 holding, 20 asked: the second window is the half the first one left.
    expect(second.filter((id) => first.has(id))).toHaveLength(0);
  });

  it('wraps back round rather than running out', () => {
    const third = pickTestDraw(POOL, 20, 3, SEED);
    expect(third).toHaveLength(20);
    expect(new Set(third).size).toBe(20);
  });

  it('is stable for one sitting, so a refresh does not reshuffle the paper', () => {
    expect(pickTestDraw(POOL, 20, 1, SEED)).toEqual(pickTestDraw(POOL, 20, 1, SEED));
  });

  it('gives two students different papers from the same pool', () => {
    const mine = pickTestDraw(POOL, 20, 1, testDrawSeed('student-1', 'test-1'));
    const theirs = pickTestDraw(POOL, 20, 1, testDrawSeed('student-2', 'test-1'));
    expect(mine).not.toEqual(theirs);
  });

  it('degrades to a reshuffle when the pool is no bigger than the serve count', () => {
    const small = ['a', 'b', 'c'];
    const first = pickTestDraw(small, 3, 1, SEED);
    const second = pickTestDraw(small, 3, 2, SEED);
    expect(new Set(first)).toEqual(new Set(small));
    expect(new Set(second)).toEqual(new Set(small));
  });

  it('never asks for more than it holds', () => {
    expect(pickTestDraw(['a', 'b'], 20, 1, SEED)).toHaveLength(2);
  });

  it('returns nothing for an empty pool rather than throwing', () => {
    expect(pickTestDraw([], 20, 1, SEED)).toEqual([]);
  });
});

describe('options are relabelled, not merely reordered', () => {
  const question = {
    question_id: 'q1',
    options: [
      { id: 'a', text: 'Doric' },
      { id: 'b', text: 'Ionic' },
      { id: 'c', text: 'Corinthian' },
      { id: 'd', text: 'Tuscan' },
    ],
  };

  it('shows the mapped option under a fresh letter', () => {
    const map = ['c', 'a', 'd', 'b'];
    const served = applyTestOptionMap(question, map) as typeof question;
    // Keeping the original ids would make the shuffle decorative: the client
    // would hand back the original letter and nothing would have been hidden.
    expect(served.options.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(served.options.map((o) => o.text)).toEqual(['Corinthian', 'Doric', 'Tuscan', 'Ionic']);
  });

  it('leaves a question alone when there is no map', () => {
    expect(applyTestOptionMap(question, undefined)).toBe(question);
  });

  it('leaves a question alone when the map no longer fits it', () => {
    // An option was edited away between the serve and this read. Serving a
    // paper with holes in it would be worse than serving it unpermuted.
    expect(applyTestOptionMap(question, ['a', 'b', 'z'])).toBe(question);
  });

  it('skips a question with nothing to permute', () => {
    const maps = buildTestOptionMaps([{ question_id: 'n1', options: null }], 1, SEED);
    expect(maps.n1).toBeUndefined();
  });

  it('handles a two-option question without assuming four', () => {
    const maps = buildTestOptionMaps(
      [{ question_id: 'q2', options: [{ id: 'a', text: 'True' }, { id: 'b', text: 'False' }] }],
      1,
      SEED,
    );
    expect(new Set(maps.q2)).toEqual(new Set(['a', 'b']));
  });

  it('gives the same question a different lettering next attempt', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const first = permuteOptionIds(ids, 'q1', 1, SEED);
    const second = permuteOptionIds(ids, 'q1', 2, SEED);
    expect(first).not.toEqual(second);
    expect(new Set(second)).toEqual(new Set(ids));
  });
});

describe('a permuted answer grades against the option the student clicked', () => {
  const map = ['c', 'a', 'd', 'b'];

  it('round trips a letter both ways', () => {
    // Original 'c' is shown first, so the student clicks 'a'.
    expect(originalToDisplayedId('c', map)).toBe('a');
    expect(displayedToOriginalId('a', map)).toBe('c');
  });

  it('marks a correct choice correct, which is the whole point', () => {
    const correctAnswer = 'c';
    const clicked = originalToDisplayedId(correctAnswer, map)!;
    const translated = displayedToOriginalId(clicked, map);
    expect(gradeQBAnswerStrict('MCQ', translated, correctAnswer, null)).toBe(true);
  });

  it('marks a wrong choice wrong', () => {
    // The student clicked the second option shown, which is original 'a'.
    expect(gradeQBAnswerStrict('MCQ', displayedToOriginalId('b', map), 'c', null)).toBe(false);
  });

  it('would mark the correct choice WRONG without the translation', () => {
    // The regression this whole module exists to prevent.
    const clicked = originalToDisplayedId('c', map)!;
    expect(gradeQBAnswerStrict('MCQ', clicked, 'c', null)).toBe(false);
  });

  it('passes a letter straight through when nothing was permuted', () => {
    expect(displayedToOriginalId('b', undefined)).toBe('b');
    expect(originalToDisplayedId('b', undefined)).toBe('b');
  });
});

describe('the answer sheet is cut to the draw before grading', () => {
  const drawn = ['q1', 'q2'];
  const maps = { q1: ['c', 'a', 'd', 'b'], q2: ['b', 'c', 'a', 'd'] };

  it('translates every drawn answer', () => {
    expect(translateDrawnAnswers({ q1: 'a', q2: 'a' }, drawn, maps)).toEqual({ q1: 'c', q2: 'b' });
  });

  it('drops an answer to a question that was never served', () => {
    // Stale autosave from an earlier attempt, or a client answering something
    // it was not given. Neither belongs in the score.
    expect(translateDrawnAnswers({ q1: 'a', q99: 'd' }, drawn, maps)).toEqual({ q1: 'c' });
  });

  it('leaves a numerical answer untouched', () => {
    // No permutation to undo, and running a number through the letter
    // translator would case-fold a value the grader is about to parse.
    expect(translateDrawnAnswers({ q1: '3.14E2' }, ['q1'], {})).toEqual({ q1: '3.14E2' });
  });

  it('handles an empty sheet', () => {
    expect(translateDrawnAnswers({}, drawn, maps)).toEqual({});
  });
});
