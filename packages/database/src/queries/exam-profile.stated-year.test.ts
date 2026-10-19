import { describe, it, expect } from 'vitest';
import { recordStatedExamYear, getExamYearStatus, snoozeExamYearPromptForUser } from './exam-profile';

/**
 * recordStatedExamYear is the one write path for "which year will you write the
 * exam". These pin the rules every surface relies on: batch years are never
 * touched, implausible years are refused, a new row does not skip the Question
 * Bank onboarding, Aintra never replaces a deliberate answer, and a database
 * without the source columns still saves the year.
 */

type Row = Record<string, any>;

function fakeDb(seed: Record<string, Row[]>, opts: { missingSourceColumns?: boolean } = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  const writes: { table: string; op: string; payload: Row }[] = [];

  function from(table: string) {
    tables[table] = tables[table] || [];
    const filters: ((r: Row) => boolean)[] = [];
    let mode: 'select' | 'update' | 'insert' = 'select';
    let payload: Row = {};

    const badColumns = (p: Row) =>
      opts.missingSourceColumns && table === 'user_exam_profiles' && ('planning_year_source' in p || 'planning_year_set_at' in p);

    const run = () => {
      if (mode === 'insert' || mode === 'update') {
        if (badColumns(payload)) {
          return { data: null, error: { code: 'PGRST204', message: "Could not find the 'planning_year_source' column" } };
        }
      }
      if (mode === 'insert') {
        tables[table].push({ ...payload });
        writes.push({ table, op: 'insert', payload });
        return { data: null, error: null };
      }
      const hit = tables[table].filter((r) => filters.every((f) => f(r)));
      if (mode === 'update') {
        for (const r of hit) Object.assign(r, payload);
        writes.push({ table, op: 'update', payload });
        return { data: hit, error: null };
      }
      return { data: hit, error: null };
    };

    const api: any = {
      select: () => api,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), api),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), api),
      order: () => api,
      limit: () => api,
      update: (p: Row) => ((mode = 'update'), (payload = p), api),
      insert: (p: Row) => ((mode = 'insert'), (payload = p), api),
      maybeSingle: () => {
        const r = run();
        return Promise.resolve({ data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error });
      },
      then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
    };
    return api;
  }

  return { client: { from } as any, tables, writes };
}

const NOW = new Date('2026-10-19T06:00:00Z'); // choices 2027..2030
const U = 'user-1';

describe('recordStatedExamYear', () => {
  it('inserts a new profile with the year and its source, without completing QB onboarding', async () => {
    const db = fakeDb({ users: [{ id: U, academic_year: null }] });
    const res = await recordStatedExamYear(db.client, U, 2028, 'tools_sheet', NOW);
    expect(res).toEqual({ saved: true, year: 2028, source: 'tools_sheet' });
    const row = db.tables.user_exam_profiles[0];
    expect(row).toMatchObject({
      user_id: U,
      planning_year: 2028,
      planning_year_source: 'tools_sheet',
      nata_status: 'planning_to_apply',
      qb_onboarding_completed: false,
    });
    expect(row.planning_year_set_at).toBe(NOW.toISOString());
  });

  it('updates an existing profile in place', async () => {
    const db = fakeDb({
      users: [{ id: U, academic_year: null }],
      user_exam_profiles: [{ id: 'p', user_id: U, planning_year: 2027, qb_onboarding_completed: true }],
    });
    const res = await recordStatedExamYear(db.client, U, 2029, 'demo', NOW);
    expect(res.saved).toBe(true);
    expect(db.tables.user_exam_profiles).toHaveLength(1);
    expect(db.tables.user_exam_profiles[0]).toMatchObject({
      planning_year: 2029,
      planning_year_source: 'demo',
      qb_onboarding_completed: true,
    });
  });

  it('never overwrites a batch year', async () => {
    const db = fakeDb({ users: [{ id: U, academic_year: '2026-27' }] });
    const res = await recordStatedExamYear(db.client, U, 2028, 'tools_sheet', NOW);
    expect(res).toEqual({ saved: false, reason: 'batch' });
    expect(db.writes).toHaveLength(0);
  });

  it('refuses a year outside the picker range plus or minus one', async () => {
    const db = fakeDb({ users: [{ id: U, academic_year: null }] });
    for (const y of [2025, 2032, 'soon', null, 2027.5]) {
      expect(await recordStatedExamYear(db.client, U, y, 'apply', NOW)).toEqual({ saved: false, reason: 'invalid_year' });
    }
    expect((await recordStatedExamYear(db.client, U, 2026, 'apply', NOW)).saved).toBe(true);
    expect((await recordStatedExamYear(db.client, U, '2031', 'apply', NOW)).saved).toBe(true);
  });

  it('Aintra does not replace a year the student already stated', async () => {
    const db = fakeDb({
      users: [{ id: U, academic_year: null }],
      user_exam_profiles: [{ id: 'p', user_id: U, planning_year: 2027 }],
    });
    expect(await recordStatedExamYear(db.client, U, 2029, 'aintra', NOW)).toEqual({ saved: false, reason: 'kept_existing' });
    expect(db.tables.user_exam_profiles[0].planning_year).toBe(2027);
  });

  it('still saves the year when the source columns are not migrated yet', async () => {
    const db = fakeDb({ users: [{ id: U, academic_year: null }] }, { missingSourceColumns: true });
    const res = await recordStatedExamYear(db.client, U, 2028, 'tools_sheet', NOW);
    expect(res.saved).toBe(true);
    expect(db.tables.user_exam_profiles[0].planning_year).toBe(2028);
    expect(db.tables.user_exam_profiles[0].planning_year_source).toBeUndefined();
  });

  it('reports a missing user', async () => {
    const db = fakeDb({ users: [] });
    expect(await recordStatedExamYear(db.client, U, 2028, 'tools_sheet', NOW)).toEqual({ saved: false, reason: 'no_user' });
    expect(await recordStatedExamYear(db.client, null, 2028, 'tools_sheet', NOW)).toEqual({ saved: false, reason: 'no_user' });
  });
});

describe('getExamYearStatus', () => {
  it('a batch year means no prompt', async () => {
    const db = fakeDb({ users: [{ id: U, academic_year: '2026-27', metadata: {} }] });
    expect(await getExamYearStatus(db.client, U, NOW)).toMatchObject({ year: 2027, source: 'batch', promptDue: false });
  });

  it('an application form year counts as stated', async () => {
    const db = fakeDb({
      users: [{ id: U, academic_year: null, metadata: {} }],
      lead_profiles: [{ user_id: U, target_exam_year: 2028, deleted_at: null }],
    });
    expect(await getExamYearStatus(db.client, U, NOW)).toMatchObject({ year: 2028, source: 'stated', promptDue: false });
  });

  it('nothing stated and never snoozed: ask', async () => {
    const db = fakeDb({ users: [{ id: U, academic_year: null, metadata: null }] });
    expect(await getExamYearStatus(db.client, U, NOW)).toMatchObject({ year: null, source: null, promptDue: true });
  });

  it('a snooze is stored in metadata and hides the prompt until it runs out', async () => {
    const db = fakeDb({ users: [{ id: U, academic_year: null, metadata: { other: 'kept' } }] });
    await snoozeExamYearPromptForUser(db.client, U, 'not_sure', NOW);
    expect(db.tables.users[0].metadata.other).toBe('kept');
    expect(db.tables.users[0].metadata.exam_year_prompt.dismissed_count).toBe(1);
    expect((await getExamYearStatus(db.client, U, NOW)).promptDue).toBe(false);
    const later = new Date(NOW.getTime() + 31 * 24 * 60 * 60 * 1000);
    expect((await getExamYearStatus(db.client, U, later)).promptDue).toBe(true);
  });
});
