import { describe, it, expect } from 'vitest';
import { pickNextPending } from './review-next';

describe('pickNextPending', () => {
  const pending = [
    { id: 'c', submitted_at: '2026-09-10T09:00:00Z' },
    { id: 'a', submitted_at: '2026-09-08T09:00:00Z' },
    { id: 'b', submitted_at: '2026-09-09T09:00:00Z' },
  ];

  it('opens the oldest waiting drawing and says how many are left after it', () => {
    expect(pickNextPending(pending, 'zzz')).toEqual({ nextId: 'a', remaining: 3 });
  });

  it('skips the drawing that was just reviewed', () => {
    expect(pickNextPending(pending, 'a')).toEqual({ nextId: 'b', remaining: 2 });
  });

  it('reports nothing left when the reviewed drawing was the last one waiting', () => {
    expect(pickNextPending([{ id: 'a', submitted_at: '2026-09-08T09:00:00Z' }], 'a')).toEqual({
      nextId: null,
      remaining: 0,
    });
  });

  it('ignores entries with no id', () => {
    expect(pickNextPending([{ id: '', submitted_at: '2026-09-01T09:00:00Z' }, ...pending], 'zzz').nextId).toBe('a');
  });
});
