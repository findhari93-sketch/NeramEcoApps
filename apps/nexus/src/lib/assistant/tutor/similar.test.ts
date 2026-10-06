import { describe, expect, it } from 'vitest';
import { levelOf, pickSimilar, type Candidate, type Source } from './similar';

const src: Source = { conceptIds: ['dot', 'comp'], coreIds: ['dot'], difficulty: 'MEDIUM' };
const cand = (id: string, concepts: string[], over: Partial<Candidate> = {}): Candidate => ({
  question_id: id, concept_ids: concepts, core_ids: concepts.slice(0, 1), difficulty: 'MEDIUM', attempted: false, has_pack: false, ...over,
});

describe('levelOf', () => {
  it('sorts by overlap, new ideas and difficulty', () => {
    expect(levelOf(src, cand('a', ['dot', 'comp']))).toBe('very_similar');
    expect(levelOf(src, cand('b', ['dot', 'comp'], { difficulty: 'EASY' }))).toBe('variation');
    expect(levelOf(src, cand('c', ['dot', 'comp', 'angle']))).toBe('extension');
    expect(levelOf(src, cand('d', ['dot', 'angle', 'proj']))).toBe('challenge');
    expect(levelOf(src, cand('e', ['dot', 'comp'], { difficulty: 'HARD' }))).toBe('challenge');
    // Shares only a side idea: not a stretch of this question.
    expect(levelOf(src, cand('f', ['comp', 'x', 'y', 'z']))).toBeNull();
    expect(levelOf(src, cand('g', ['other']))).toBeNull();
  });
});

describe('pickSimilar', () => {
  it('gives one question per level, in level order', () => {
    const out = pickSimilar(src, [
      cand('d', ['dot', 'angle', 'proj']),
      cand('a', ['dot', 'comp']),
      cand('c', ['dot', 'comp', 'angle']),
      cand('b', ['dot', 'comp'], { difficulty: 'EASY' }),
    ], {});
    expect(out.map((o) => [o.level, o.questionId])).toEqual([
      ['very_similar', 'a'], ['variation', 'b'], ['extension', 'c'], ['challenge', 'd'],
    ]);
  });

  it('prefers a question the tutor can teach, then one not yet attempted', () => {
    const out = pickSimilar(src, [
      cand('x1', ['dot', 'comp'], { attempted: true }),
      cand('x2', ['dot', 'comp']),
      cand('x3', ['dot', 'comp'], { attempted: true, has_pack: true }),
    ], {});
    expect(out).toEqual([{ questionId: 'x3', level: 'very_similar', hasPack: true }]);
  });

  it('is empty when nothing fits', () => {
    expect(pickSimilar(src, [cand('z', ['other'])], {})).toEqual([]);
  });
});
