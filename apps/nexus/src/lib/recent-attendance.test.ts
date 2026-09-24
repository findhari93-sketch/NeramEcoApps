import { describe, expect, it } from 'vitest';
import { countRecent } from './recent-attendance';

const classes = [
  { id: 'c5', scheduled_date: '2026-09-15' },
  { id: 'c4', scheduled_date: '2026-09-11' },
  { id: 'c3', scheduled_date: '2026-09-09' },
  { id: 'c2', scheduled_date: '2026-09-07' },
  { id: 'c1', scheduled_date: '2026-09-03' },
];

const base = {
  classes,
  studentIds: ['s'],
  enrolledAt: new Map<string, string | null>([['s', '2026-06-01T00:00:00Z']]),
  attended: new Set<string>(),
  notTaught: new Set<string>(),
  excused: new Set<string>(),
  explained: new Set<string>(),
};

describe('countRecent', () => {
  it('counts misses, and which of them came with no reason', () => {
    const r = countRecent({
      ...base,
      attended: new Set(['c1:s']),
      explained: new Set(['c2:s']),
    }).get('s');
    expect(r).toEqual({ of: 5, missed: 4, unexplained: 3 });
  });

  it('skips a class that was not taught and one the student enrolled after', () => {
    const r = countRecent({
      ...base,
      enrolledAt: new Map([['s', '2026-09-08T00:00:00Z']]),
      notTaught: new Set(['c4']),
    }).get('s');
    // c1 and c2 were before they enrolled, c4 was not a class: c3 and c5 remain.
    expect(r).toEqual({ of: 2, missed: 2, unexplained: 2 });
  });

  it('does not count an excused class as missed', () => {
    const r = countRecent({ ...base, excused: new Set(['c5:s']) }).get('s');
    expect(r?.missed).toBe(4);
  });
});
