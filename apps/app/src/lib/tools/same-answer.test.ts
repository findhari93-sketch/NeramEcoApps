import { describe, expect, it } from 'vitest';
import { foldSameAnswer, type AnswerCandidate } from './same-answer';

const town = (slug: string, key: string, over: Partial<AnswerCandidate> = {}): AnswerCandidate => ({ slug, key, index: true, score: 3, population: 1000, ...over });

describe('foldSameAnswer', () => {
  it('keeps the strongest town of a set as the indexed page and lists the others on it', () => {
    const { leaderOf, members } = foldSameAnswer([
      town('small', 'patna|gaya', { population: 10 }),
      town('big', 'patna|gaya', { population: 900 }),
      town('strong', 'patna|gaya', { score: 5, population: 50 }),
      town('alone', 'ranchi'),
    ]);
    expect(leaderOf.get('small')).toBe('strong');
    expect(leaderOf.get('big')).toBe('strong');
    expect(leaderOf.get('strong')).toBe('strong');
    expect(leaderOf.get('alone')).toBe('alone');
    expect(members.get('strong')).toEqual(['big', 'small']);
    expect(members.has('alone')).toBe(false);
  });

  it('a held town joins an indexable one, but a set of held towns gets no leader', () => {
    const { leaderOf, members } = foldSameAnswer([
      town('held', 'a', { index: false, score: 1 }),
      town('ok', 'a'),
      town('h1', 'b', { index: false }),
      town('h2', 'b', { index: false }),
    ]);
    expect(leaderOf.get('held')).toBe('ok');
    expect(members.get('ok')).toEqual(['held']);
    expect(leaderOf.get('h1')).toBe('h1');
    expect(leaderOf.get('h2')).toBe('h2');
  });
});
