// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { PeopleBreakdownRow } from '@neram/database';
import { seasonBounds, summarisePeople } from './people-summary';

const row = (over: Partial<PeopleBreakdownRow> & { n: number }): PeopleBreakdownRow => ({
  lifecycle_status: 'active',
  exam_year: 2027,
  exam_year_source: 'stated',
  lifecycle_stage: 'lead',
  engagement: 'dormant',
  ...over,
});

// A small slice shaped like prod on 2026-09-28.
const rows: PeopleBreakdownRow[] = [
  row({ exam_year: 2026, exam_year_source: 'signup', lifecycle_stage: 'lead', engagement: 'dormant', n: 900 }),
  row({ exam_year: 2026, exam_year_source: 'signup', lifecycle_stage: 'prospect', engagement: 'dormant', n: 300 }),
  row({ exam_year: 2027, exam_year_source: 'signup', lifecycle_stage: 'lead', engagement: 'inactive', n: 200 }),
  row({ exam_year: 2027, exam_year_source: 'stated', lifecycle_stage: 'lead', engagement: 'engaged', n: 40 }),
  row({ exam_year: 2027, exam_year_source: 'batch', lifecycle_stage: 'active_student', engagement: 'low', n: 37 }),
  row({ exam_year: 2027, exam_year_source: 'stated', lifecycle_stage: 'applicant', engagement: 'dormant', n: 5 }),
  row({ exam_year: 2028, exam_year_source: 'stated', lifecycle_stage: 'active_student', engagement: 'new', n: 10 }),
  row({ lifecycle_status: 'archived', exam_year: 2026, lifecycle_stage: 'archived', engagement: 'dormant', n: 60 }),
  row({ lifecycle_status: 'archived', exam_year: 2025, lifecycle_stage: 'alumni', engagement: 'dormant', n: 10 }),
];

const base = { view: 'active' as const, season: 'current' as const, currentExamYear: 2027 };

describe('seasonBounds', () => {
  it.each([
    ['current', { examYearMin: 2027, examYearMax: 2027 }],
    ['later', { examYearMin: 2028 }],
    ['earlier', { examYearMax: 2026 }],
    ['all', {}],
    ['2029', { examYearMin: 2029, examYearMax: 2029 }],
    ['junk', {}],
    [null, {}],
  ])('%s', (season, expected) => {
    expect(seasonBounds(season, 2027)).toEqual(expected);
  });
});

describe('summarisePeople', () => {
  it('counts every row once in the totals, whatever is selected', () => {
    const s = summarisePeople(rows, { ...base, stage: 'lead', activity: 'recent' });
    expect(s.totals).toEqual({ active: 1492, archived: 70, all: 1562 });
  });

  it('counts the season chips within the chosen view', () => {
    const s = summarisePeople(rows, base);
    expect(s.seasons).toEqual({ current: 282, later: 10, earlier: 1200, all: 1492 });
    expect(s.seasons.current + s.seasons.later + s.seasons.earlier).toBe(s.seasons.all);
  });

  it('reports how many exam years in the season are estimated', () => {
    expect(summarisePeople(rows, base).estimated).toBe(200);
    expect(summarisePeople(rows, { ...base, season: 'earlier' }).estimated).toBe(1200);
  });

  it('activity and stage cards each add up to the season when nothing else is chosen', () => {
    const s = summarisePeople(rows, base);
    expect(s.activity).toEqual({ recent: 77, quiet: 200, gone: 5 });
    expect(s.stages.lead).toBe(240);
    expect(s.stages.active_student).toBe(37);
    expect(s.stages.applicant).toBe(5);
    expect(s.matching).toBe(282);
  });

  it('cross-filters: stage cards count within the chosen activity, and the reverse', () => {
    const byActivity = summarisePeople(rows, { ...base, activity: 'recent' });
    expect(byActivity.stages.lead).toBe(40);
    expect(byActivity.stages.active_student).toBe(37);
    // The activity cards themselves are not narrowed by the chosen activity.
    expect(byActivity.activity).toEqual({ recent: 77, quiet: 200, gone: 5 });
    expect(byActivity.matching).toBe(77);

    const byStage = summarisePeople(rows, { ...base, stage: 'lead' });
    expect(byStage.activity).toEqual({ recent: 40, quiet: 200, gone: 0 });
    expect(byStage.matching).toBe(240);

    const both = summarisePeople(rows, { ...base, stage: 'lead', activity: 'quiet' });
    expect(both.matching).toBe(200);
  });

  it('the Archived view counts archived people only', () => {
    const s = summarisePeople(rows, { ...base, view: 'archived', season: 'all' });
    expect(s.seasons.all).toBe(70);
    expect(s.stages.archived).toBe(60);
    expect(s.stages.alumni).toBe(10);
    expect(s.stages.lead).toBe(0);
  });

  it('handles no rows', () => {
    const s = summarisePeople([], base);
    expect(s.totals.all).toBe(0);
    expect(s.matching).toBe(0);
    expect(s.activity).toEqual({ recent: 0, quiet: 0, gone: 0 });
  });
});
