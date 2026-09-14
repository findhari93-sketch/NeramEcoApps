import { describe, it, expect } from 'vitest';
import {
  countStages,
  dropDormant,
  filterByStages,
  listStateToParams,
  parseListParams,
  pausedFootnote,
  searchAndSort,
  type FactsLookup,
  type ListAccessors,
  type ListState,
} from './student-list-view';
import type { StageKey } from './student-stage';

interface Row { student_id: string; student_name: string; joined?: string | null; paused?: boolean; score?: number }

const a: ListAccessors<Row> = {
  id: (r) => r.student_id,
  name: (r) => r.student_name,
  joinedAt: (r) => r.joined,
  dormant: (r) => r.paused,
};

const facts: Record<string, { stage: StageKey; dormant: boolean }> = {
  asha: { stage: '12th', dormant: false },
  bala: { stage: 'gap_year', dormant: false },
  charu: { stage: '11th', dormant: true },
  dev: { stage: '10th', dormant: false },
};
const factsFor: FactsLookup = (id) => facts[id] ?? null;

const rows: Row[] = [
  { student_id: 'dev', student_name: 'Dev Kumar', joined: '2026-06-01' },
  { student_id: 'asha', student_name: 'Asha Bavi', joined: '2026-09-10' },
  { student_id: 'charu', student_name: 'Charu', joined: '2026-07-01' },
  { student_id: 'bala', student_name: 'Bala', joined: null },
  { student_id: 'ezhil', student_name: 'Ezhil', joined: '2026-08-01', paused: true },
];

describe('dropDormant', () => {
  it('hides students dormant by the row flag or by the stage facts and counts them', () => {
    const { kept, paused } = dropDormant(rows, a, factsFor);
    expect(kept.map((r) => r.student_id)).toEqual(['dev', 'asha', 'bala']);
    expect(paused).toBe(2);
  });
  it('keeps a dormant row the screen must still show, without counting it as hidden', () => {
    const { kept, paused } = dropDormant(rows, a, factsFor, (r) => r.student_id === 'charu');
    expect(kept.map((r) => r.student_id)).toEqual(['dev', 'asha', 'charu', 'bala']);
    expect(paused).toBe(1);
  });
});

describe('stage filter', () => {
  it('groups Break Year with Class 12, and treats an unknown student as Not set', () => {
    const withUnknown = [...rows, { student_id: 'zoya', student_name: 'Zoya' }];
    expect(countStages(withUnknown, a, factsFor)).toEqual({ exam_this_year: 2, exam_next_year: 1, lower: 1, unset: 2 });
    expect(filterByStages(rows, ['exam_this_year'], a, factsFor).map((r) => r.student_id)).toEqual(['asha', 'bala']);
  });
  it('no stage picked means everyone, several means any', () => {
    expect(filterByStages(rows, [], a, factsFor)).toHaveLength(rows.length);
    expect(filterByStages(rows, ['lower', 'exam_next_year'], a, factsFor).map((r) => r.student_id)).toEqual(['dev', 'charu']);
  });
});

describe('searchAndSort', () => {
  it('sorts by name, newest joined and oldest joined, unknown join dates last', () => {
    expect(searchAndSort(rows, '', 'name', a).map((r) => r.student_id)).toEqual(['asha', 'bala', 'charu', 'dev', 'ezhil']);
    expect(searchAndSort(rows, '', 'joined_newest', a).map((r) => r.student_id)).toEqual(['asha', 'ezhil', 'charu', 'dev', 'bala']);
    expect(searchAndSort(rows, '', 'joined_oldest', a).map((r) => r.student_id)).toEqual(['dev', 'charu', 'ezhil', 'asha', 'bala']);
  });

  it('uses a screen sort with name as the tie break', () => {
    const scored = rows.map((r, i) => ({ ...r, score: i % 2 }));
    const extra = [{ key: 'score_high' as const, label: 'Score high to low', compare: (x: Row, y: Row) => (y.score ?? 0) - (x.score ?? 0) }];
    expect(searchAndSort(scored, '', 'score_high', a, extra).map((r) => r.student_id)).toEqual(['asha', 'bala', 'charu', 'dev', 'ezhil']);
  });

  it('while searching, a name that starts with the letters comes before one that only contains them', () => {
    // "ba": Bala starts with it, Asha Bavi only has a later word starting with it.
    expect(searchAndSort(rows, 'ba', 'name', a).map((r) => r.student_id)).toEqual(['bala', 'asha']);
  });
});

describe('URL state', () => {
  const defaults: ListState = { q: '', sort: 'quiet_longest', stages: [], status: 'all' };
  const allowed = { sorts: ['name', 'joined_newest', 'joined_oldest', 'quiet_longest'], statuses: ['needs_nudge', 'on_track'] };

  it('reads known values and ignores junk', () => {
    expect(parseListParams('?sort=name&stage=lower,bogus,exam_this_year&status=needs_nudge&q=ba', allowed, defaults)).toEqual({
      q: 'ba', sort: 'name', stages: ['lower', 'exam_this_year'], status: 'needs_nudge',
    });
    expect(parseListParams('?sort=drop_table&status=nope', allowed, defaults)).toEqual(defaults);
  });

  it('writes only what differs from the default, in a stable order', () => {
    expect(listStateToParams({ q: '', sort: 'quiet_longest', stages: [], status: 'all' }, defaults)).toEqual({
      q: null, sort: null, stage: null, status: null,
    });
    expect(listStateToParams({ q: 'ba', sort: 'name', stages: ['unset', 'exam_this_year'], status: 'on_track' }, defaults)).toEqual({
      q: 'ba', sort: 'name', stage: 'exam_this_year,unset', status: 'on_track',
    });
  });

  it('honours custom keys so a screen can avoid clashing params', () => {
    const keys = { q: 'sq', sort: 'ssort', stage: 'sstage', status: 'filter' };
    expect(parseListParams('?ssort=name&filter=on_track', allowed, defaults, keys)).toMatchObject({ sort: 'name', status: 'on_track' });
  });
});

describe('pausedFootnote', () => {
  it('says how many are hidden, in plain words', () => {
    expect(pausedFootnote(0)).toBeNull();
    expect(pausedFootnote(1)).toBe('1 paused student is not shown.');
    expect(pausedFootnote(3)).toBe('3 paused students are not shown.');
  });
});
