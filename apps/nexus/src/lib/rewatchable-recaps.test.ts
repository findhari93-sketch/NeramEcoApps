import { describe, it, expect } from 'vitest';
import { listRewatchableRecaps, REWATCHABLE_LIMIT } from './rewatchable-recaps';

/**
 * A Supabase stand-in that applies the filters the real one would and counts the
 * queries issued. The count is asserted because the whole reason this list is
 * built inside the catch-up request is that it must not multiply round trips.
 */
function fakeSupabase(rows: Record<string, any[]>, failOn?: string) {
  let queries = 0;

  return {
    get queries() {
      return queries;
    },
    from(table: string) {
      queries += 1;
      let data: any[] = rows[table] ? [...rows[table]] : [];
      const fails = failOn === table;

      const builder: any = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          data = data.filter((r) => r[col] === val);
          return builder;
        },
        in: (col: string, vals: unknown[]) => {
          data = data.filter((r) => vals.includes(r[col]));
          return builder;
        },
        order: (col: string, opts?: { ascending?: boolean }) => {
          const dir = opts?.ascending === false ? -1 : 1;
          data = [...data].sort((a, b) => (a[col] < b[col] ? -dir : a[col] > b[col] ? dir : 0));
          return builder;
        },
        limit: (n: number) => {
          data = data.slice(0, n);
          return builder;
        },
        then: (resolve: (v: { data: any[]; error: unknown }) => unknown) =>
          resolve(fails ? { data: [], error: new Error('boom') } : { data, error: null }),
      };
      return builder;
    },
  };
}

const CLASSROOM = 'room-1';
const STUDENT = 'stu-1';

function recap(over: Record<string, any> = {}) {
  return {
    id: 'recap-attended',
    classroom_id: CLASSROOM,
    scheduled_class_id: 'class-attended',
    title: 'Stored title',
    status: 'published',
    readiness: 'ready',
    created_at: '2026-08-01T00:00:00Z',
    sections: [{ id: 's1' }, { id: 's2' }],
    ...over,
  };
}

function scheduled(id: string, date: string, title = 'Live title') {
  return { id, title, scheduled_date: date };
}

const baseRows = {
  nexus_class_recaps: [recap()],
  nexus_scheduled_classes: [scheduled('class-attended', '2026-08-01')],
  nexus_class_absences: [],
  nexus_class_recap_progress: [],
};

describe('listRewatchableRecaps', () => {
  it('includes a class the student attended, with the live class title', async () => {
    const db = fakeSupabase(baseRows);
    const { rewatchable, truncated } = await listRewatchableRecaps(db, STUDENT, CLASSROOM);

    expect(rewatchable).toEqual([
      {
        recap_id: 'recap-attended',
        class_id: 'class-attended',
        title: 'Live title',
        date: '2026-08-01',
        section_count: 2,
        watched: false,
      },
    ]);
    expect(truncated).toBe(false);
  });

  // The load-bearing rule: anything still owed belongs in the other tab, and
  // must never appear in both.
  it('excludes a class with an open absence row', async () => {
    const db = fakeSupabase({
      ...baseRows,
      nexus_class_absences: [
        { scheduled_class_id: 'class-attended', student_id: STUDENT, caught_up_at: null, excused_at: null },
      ],
    });
    const { rewatchable } = await listRewatchableRecaps(db, STUDENT, CLASSROOM);
    expect(rewatchable).toEqual([]);
  });

  it('includes a class the student already caught up on', async () => {
    const db = fakeSupabase({
      ...baseRows,
      nexus_class_absences: [
        {
          scheduled_class_id: 'class-attended',
          student_id: STUDENT,
          caught_up_at: '2026-08-05T00:00:00Z',
          excused_at: null,
        },
      ],
    });
    const { rewatchable } = await listRewatchableRecaps(db, STUDENT, CLASSROOM);
    expect(rewatchable).toHaveLength(1);
  });

  it('includes a class the student was excused from', async () => {
    const db = fakeSupabase({
      ...baseRows,
      nexus_class_absences: [
        {
          scheduled_class_id: 'class-attended',
          student_id: STUDENT,
          caught_up_at: null,
          excused_at: '2026-08-05T00:00:00Z',
        },
      ],
    });
    const { rewatchable } = await listRewatchableRecaps(db, STUDENT, CLASSROOM);
    expect(rewatchable).toHaveLength(1);
  });

  it('ignores another student’s absence row', async () => {
    const db = fakeSupabase({
      ...baseRows,
      nexus_class_absences: [
        { scheduled_class_id: 'class-attended', student_id: 'someone-else', caught_up_at: null, excused_at: null },
      ],
    });
    const { rewatchable } = await listRewatchableRecaps(db, STUDENT, CLASSROOM);
    expect(rewatchable).toHaveLength(1);
  });

  it('excludes drafts and recaps held back by readiness', async () => {
    const db = fakeSupabase({
      ...baseRows,
      nexus_class_recaps: [
        recap({ id: 'draft', status: 'draft' }),
        recap({ id: 'held', readiness: 'held' }),
        recap({ id: 'pending', readiness: 'pending' }),
        recap({ id: 'failed', readiness: 'failed' }),
      ],
    });
    const { rewatchable } = await listRewatchableRecaps(db, STUDENT, CLASSROOM);
    expect(rewatchable).toEqual([]);
  });

  // NULL predates the readiness column, so it must not be read as "not ready".
  it('includes a recap whose readiness has never been stamped', async () => {
    const db = fakeSupabase({ ...baseRows, nexus_class_recaps: [recap({ readiness: null })] });
    const { rewatchable } = await listRewatchableRecaps(db, STUDENT, CLASSROOM);
    expect(rewatchable).toHaveLength(1);
  });

  it('excludes an ad-hoc recap with no class behind it', async () => {
    const db = fakeSupabase({ ...baseRows, nexus_class_recaps: [recap({ scheduled_class_id: null })] });
    const { rewatchable } = await listRewatchableRecaps(db, STUDENT, CLASSROOM);
    expect(rewatchable).toEqual([]);
  });

  it('excludes a recap whose class row has gone', async () => {
    const db = fakeSupabase({ ...baseRows, nexus_scheduled_classes: [] });
    const { rewatchable } = await listRewatchableRecaps(db, STUDENT, CLASSROOM);
    expect(rewatchable).toEqual([]);
  });

  it('marks watched only for a completed progress row', async () => {
    const db = fakeSupabase({
      ...baseRows,
      nexus_class_recaps: [
        recap({ id: 'r-done', scheduled_class_id: 'c1' }),
        recap({ id: 'r-part', scheduled_class_id: 'c2' }),
      ],
      nexus_scheduled_classes: [scheduled('c1', '2026-08-02'), scheduled('c2', '2026-08-01')],
      nexus_class_recap_progress: [
        { recap_id: 'r-done', student_id: STUDENT, status: 'completed' },
        { recap_id: 'r-part', student_id: STUDENT, status: 'in_progress' },
      ],
    });
    const { rewatchable } = await listRewatchableRecaps(db, STUDENT, CLASSROOM);
    expect(rewatchable.map((r) => [r.recap_id, r.watched])).toEqual([
      ['r-done', true],
      ['r-part', false],
    ]);
  });

  it('sorts by class date, newest first', async () => {
    const db = fakeSupabase({
      ...baseRows,
      nexus_class_recaps: [
        recap({ id: 'old', scheduled_class_id: 'c-old', created_at: '2026-07-01T00:00:00Z' }),
        recap({ id: 'new', scheduled_class_id: 'c-new', created_at: '2026-08-01T00:00:00Z' }),
        recap({ id: 'mid', scheduled_class_id: 'c-mid', created_at: '2026-07-15T00:00:00Z' }),
      ],
      nexus_scheduled_classes: [
        scheduled('c-old', '2026-07-01'),
        scheduled('c-new', '2026-08-01'),
        scheduled('c-mid', '2026-07-15'),
      ],
    });
    const { rewatchable } = await listRewatchableRecaps(db, STUDENT, CLASSROOM);
    expect(rewatchable.map((r) => r.recap_id)).toEqual(['new', 'mid', 'old']);
  });

  it('caps the list and reports that it did', async () => {
    const many = Array.from({ length: REWATCHABLE_LIMIT + 5 }, (_, i) =>
      recap({ id: `r${i}`, scheduled_class_id: `c${i}`, created_at: `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00Z` }),
    );
    const classes = many.map((r, i) => scheduled(r.scheduled_class_id, `2026-08-${String(i + 1).padStart(2, '0')}`));
    const db = fakeSupabase({ ...baseRows, nexus_class_recaps: many, nexus_scheduled_classes: classes });

    const { rewatchable, truncated } = await listRewatchableRecaps(db, STUDENT, CLASSROOM);
    expect(rewatchable).toHaveLength(REWATCHABLE_LIMIT);
    expect(truncated).toBe(true);
  });

  it('costs four queries regardless of how many classes there are', async () => {
    const many = Array.from({ length: 40 }, (_, i) => recap({ id: `r${i}`, scheduled_class_id: `c${i}` }));
    const classes = many.map((r) => scheduled(r.scheduled_class_id, '2026-08-01'));
    const db = fakeSupabase({ ...baseRows, nexus_class_recaps: many, nexus_scheduled_classes: classes });

    await listRewatchableRecaps(db, STUDENT, CLASSROOM);
    expect(db.queries).toBe(4);
  });

  it('costs one query when the classroom has no published recaps', async () => {
    const db = fakeSupabase({ ...baseRows, nexus_class_recaps: [] });
    const { rewatchable } = await listRewatchableRecaps(db, STUDENT, CLASSROOM);
    expect(rewatchable).toEqual([]);
    expect(db.queries).toBe(1);
  });

  // This decorates a secondary tab. It must never be the reason a student cannot
  // see what they owe.
  it('returns empty rather than throwing when a query fails', async () => {
    const db = fakeSupabase(baseRows, 'nexus_class_recaps');
    await expect(listRewatchableRecaps(db, STUDENT, CLASSROOM)).resolves.toEqual({
      rewatchable: [],
      truncated: false,
    });
  });

  it('does not query at all without a classroom', async () => {
    const db = fakeSupabase(baseRows);
    const { rewatchable } = await listRewatchableRecaps(db, STUDENT, '');
    expect(rewatchable).toEqual([]);
    expect(db.queries).toBe(0);
  });
});
