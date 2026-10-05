import { describe, it, expect } from 'vitest';
import { splitMissedClasses } from './catchup-missed-split';

const card = (id: string, date: string, status: string) => ({
  id,
  status,
  class: { scheduled_date: date },
});

describe('splitMissedClasses', () => {
  // NXS-0132: two cleared classes sat at the top of "Classes you missed" because
  // they were the oldest, so the student read them as still owed.
  it('keeps cleared classes out of the open list', () => {
    const { open, cleared } = splitMissedClasses([
      card('islamic', '2026-08-24', 'done'),
      card('cube', '2026-08-31', 'done'),
      card('famous', '2026-09-07', 'waiting'),
      card('pritzker', '2026-09-11', 'waiting'),
    ]);
    expect(open.map((i) => i.id)).toEqual(['famous', 'pritzker']);
    expect(cleared.map((i) => i.id)).toEqual(['cube', 'islamic']);
  });

  it('counts an excused class as cleared, since nothing is owed on it', () => {
    const { open, cleared } = splitMissedClasses([
      card('postponed', '2026-09-18', 'excused'),
      card('basic', '2026-09-15', 'active'),
    ]);
    expect(open.map((i) => i.id)).toEqual(['basic']);
    expect(cleared.map((i) => i.id)).toEqual(['postponed']);
  });

  it('keeps every status that still needs something in the open list, in the order given', () => {
    const { open, cleared } = splitMissedClasses([
      card('a', '2026-09-01', 'waiting'),
      card('b', '2026-09-02', 'active'),
      card('c', '2026-09-03', 'pending_teacher'),
    ]);
    expect(open.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(cleared).toEqual([]);
  });

  it('puts the most recently taught cleared class first', () => {
    const { cleared } = splitMissedClasses([
      card('old', '2026-08-01', 'done'),
      card('new', '2026-09-01', 'done'),
      card('mid', '2026-08-15', 'excused'),
    ]);
    expect(cleared.map((i) => i.id)).toEqual(['new', 'mid', 'old']);
  });

  it('handles an empty list', () => {
    expect(splitMissedClasses([])).toEqual({ open: [], cleared: [] });
  });
});
