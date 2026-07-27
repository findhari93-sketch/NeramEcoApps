import { describe, it, expect } from 'vitest';
import { seededShuffle, attemptSeed } from './seeded-shuffle';

const items = Array.from({ length: 15 }, (_, i) => `q${i + 1}`);

describe('seededShuffle', () => {
  it('is stable for the same seed, so a mid-attempt refresh keeps its order', () => {
    const a = seededShuffle(items, 'student:test:1');
    const b = seededShuffle(items, 'student:test:1');
    expect(a).toEqual(b);
  });

  it('reorders for a new attempt, so a retry is not the same paper', () => {
    const first = seededShuffle(items, attemptSeed('s1', 't1', 1));
    const second = seededShuffle(items, attemptSeed('s1', 't1', 2));
    expect(second).not.toEqual(first);
  });

  it('gives two students different papers on the same attempt', () => {
    const a = seededShuffle(items, attemptSeed('s1', 't1', 1));
    const b = seededShuffle(items, attemptSeed('s2', 't1', 1));
    expect(a).not.toEqual(b);
  });

  it('is a permutation: nothing dropped, nothing duplicated', () => {
    const out = seededShuffle(items, 'anything');
    expect(out).toHaveLength(items.length);
    expect([...out].sort()).toEqual([...items].sort());
    expect(new Set(out).size).toBe(items.length);
  });

  it('does not mutate the input', () => {
    const source = [...items];
    seededShuffle(source, 'seed');
    expect(source).toEqual(items);
  });

  it('handles empty and single-item papers', () => {
    expect(seededShuffle([], 'seed')).toEqual([]);
    expect(seededShuffle(['only'], 'seed')).toEqual(['only']);
  });

  it('actually moves things around rather than returning the input order', () => {
    // A shuffle that silently no-ops would pass every test above except this one.
    const out = seededShuffle(items, attemptSeed('s1', 't1', 1));
    expect(out).not.toEqual(items);
  });
});

describe('attemptSeed', () => {
  it('changes with every component', () => {
    const base = attemptSeed('s', 't', 1);
    expect(attemptSeed('s2', 't', 1)).not.toBe(base);
    expect(attemptSeed('s', 't2', 1)).not.toBe(base);
    expect(attemptSeed('s', 't', 2)).not.toBe(base);
  });
});
