import { describe, it, expect } from 'vitest';
import { queueFor } from './useReviewQueue';

describe('queueFor', () => {
  const ids = ['a', 'b', 'c'];

  it('knows the first drawing has nothing before it', () => {
    expect(queueFor(ids, 'a')).toEqual({ total: 3, position: 1, prevId: null, nextId: 'b' });
  });

  it('gives a middle drawing a neighbour on each side', () => {
    expect(queueFor(ids, 'b')).toEqual({ total: 3, position: 2, prevId: 'a', nextId: 'c' });
  });

  it('knows the last drawing has nothing after it', () => {
    expect(queueFor(ids, 'c')).toEqual({ total: 3, position: 3, prevId: 'b', nextId: null });
  });

  it('points a drawing that is already reviewed at the start of the queue', () => {
    expect(queueFor(ids, 'done')).toEqual({ total: 3, position: null, prevId: null, nextId: 'a' });
  });

  it('has nowhere to go in an empty queue', () => {
    expect(queueFor([], 'x')).toEqual({ total: 0, position: null, prevId: null, nextId: null });
  });
});
