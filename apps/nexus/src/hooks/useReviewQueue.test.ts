import { describe, it, expect } from 'vitest';
import { parseLane, queueFor } from './useReviewQueue';

describe('queueFor', () => {
  const ids = ['a', 'b', 'c'];

  it('knows the first drawing has nothing before it', () => {
    expect(queueFor(ids, 'a')).toEqual({ total: 3, position: 1, prevId: null, nextId: 'b', afterId: 'b' });
  });

  it('gives a middle drawing a neighbour on each side', () => {
    expect(queueFor(ids, 'b')).toEqual({ total: 3, position: 2, prevId: 'a', nextId: 'c', afterId: 'c' });
  });

  it('knows the last drawing has nothing after it, but something still waits', () => {
    expect(queueFor(ids, 'c')).toEqual({ total: 3, position: 3, prevId: 'b', nextId: null, afterId: 'a' });
  });

  it('points a drawing that is already reviewed at the start of the queue', () => {
    expect(queueFor(ids, 'done')).toEqual({ total: 3, position: null, prevId: null, nextId: 'a', afterId: 'a' });
  });

  it('has nowhere to go once the only drawing is done', () => {
    expect(queueFor(['a'], 'a').afterId).toBeNull();
  });

  it('has nowhere to go in an empty queue', () => {
    expect(queueFor([], 'x')).toEqual({ total: 0, position: null, prevId: null, nextId: null, afterId: null });
  });
});

describe('parseLane', () => {
  it('accepts the three bands', () => {
    expect(parseLane('routine')).toBe('routine');
    expect(parseLane('needs_look')).toBe('needs_look');
    expect(parseLane('flagged')).toBe('flagged');
  });

  it('ignores anything else in the address bar', () => {
    expect(parseLane('all')).toBeNull();
    expect(parseLane('')).toBeNull();
    expect(parseLane(null)).toBeNull();
  });
});
