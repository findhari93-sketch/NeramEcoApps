import { describe, expect, it } from 'vitest';
import { orderLevelQueue, sortedCount } from './level-queue';
import type { LevelQueueStudent } from './student-level-types';

const drawing = { id: 'd', studentId: 's', thumbUrl: 't', imageUrl: 'i', submittedAt: '2026-09-29', sourceType: 'sketchbook' };

function s(over: Partial<LevelQueueStudent> & { id: string }): LevelQueueStudent {
  return { name: over.id, level: null, setAt: null, drawings: [], ...over };
}

describe('orderLevelQueue', () => {
  it('puts unrated students with drawings first, then unrated without, then rated oldest first', () => {
    const ordered = orderLevelQueue([
      s({ id: 'rated-new', level: 'top', setAt: '2026-09-29T00:00:00Z', drawings: [drawing] }),
      s({ id: 'no-drawings' }),
      s({ id: 'rated-old', level: 'mid', setAt: '2026-09-01T00:00:00Z' }),
      s({ id: 'to-judge', drawings: [drawing] }),
    ]);
    expect(ordered.map((x) => x.id)).toEqual(['to-judge', 'no-drawings', 'rated-old', 'rated-new']);
  });

  it('breaks ties by name and counts the rated', () => {
    const list = [s({ id: 'b', drawings: [drawing] }), s({ id: 'a', drawings: [drawing] }), s({ id: 'c', level: 'top' })];
    expect(orderLevelQueue(list).map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(sortedCount(list)).toBe(1);
  });
});
