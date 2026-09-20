import { describe, it, expect } from 'vitest';
import {
  NOT_TAUGHT_NOTE,
  excuseClassObligations,
  restoreClassObligations,
  wasMarkedNotTaught,
} from './class-not-taught';

/**
 * Clearing the catch-up for a session that was not a class.
 *
 * Almost every test here is about what must NOT move. The action sweeps a whole
 * class at once, so the ways it can reach too far are the ways it does damage:
 * a student who already did the work, a student a teacher excused by hand for
 * their own reason, and a class cancelled for some entirely different reason.
 *
 * An in-memory fake rather than the one in packages/database: importing across
 * the package boundary would drag a file outside apps/nexus into its tsc run.
 * This one stores real rows, because the whole question is what the table looks
 * like afterwards, and a chainable call-spy cannot answer that.
 */
const CLASS = 'class-1';

interface Row {
  id: string;
  scheduled_class_id: string;
  student_id: string;
  excused_at: string | null;
  excused_by: string | null;
  excuse_note: string | null;
  caught_up_at: string | null;
}

function absence(over: Partial<Row> = {}): Row {
  return {
    id: `a-${Math.random().toString(36).slice(2, 8)}`,
    scheduled_class_id: CLASS,
    student_id: `s-${Math.random().toString(36).slice(2, 8)}`,
    excused_at: null,
    excused_by: null,
    excuse_note: null,
    caught_up_at: null,
    ...over,
  };
}

function fakeSupabase(tables: Record<string, any[]>) {
  function from(table: string) {
    const rows = () => (tables[table] ||= []);
    const filters: Array<(r: any) => boolean> = [];
    let op: 'select' | 'update' = 'select';
    let patch: any = null;
    let cap: number | null = null;

    const run = () => {
      let hit = rows().filter((r) => filters.every((f) => f(r)));
      if (op === 'update') hit.forEach((r) => Object.assign(r, patch));
      if (cap != null) hit = hit.slice(0, cap);
      return { data: hit, error: null };
    };

    const chain: any = {
      select: () => chain,
      update: (v: any) => {
        op = 'update';
        patch = v;
        return chain;
      },
      eq: (c: string, v: any) => {
        filters.push((r) => r[c] === v);
        return chain;
      },
      // PostgREST .is(col, null) matches SQL NULL, and a row written before the
      // column existed holds undefined, which has to match too.
      is: (c: string, v: any) => {
        filters.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v));
        return chain;
      },
      limit: (n: number) => {
        cap = n;
        return chain;
      },
      maybeSingle: async () => {
        const { data } = run();
        return { data: data[0] ?? null, error: null };
      },
      then: (resolve: any, reject?: any) => Promise.resolve(run()).then(resolve, reject),
    };
    return chain;
  }
  return { from };
}

describe('excusing a class that was never taught', () => {
  it('excuses every outstanding obligation and signs them', async () => {
    const rows = [absence(), absence(), absence()];
    const db = fakeSupabase({ nexus_class_absences: rows });

    const { count, studentIds } = await excuseClassObligations(db, CLASS, 'teacher-1');

    expect(count).toBe(3);
    expect(studentIds).toHaveLength(3);
    expect(rows.every((r) => r.excuse_note === NOT_TAUGHT_NOTE)).toBe(true);
    expect(rows.every((r) => r.excused_by === 'teacher-1')).toBe(true);
  });

  it('leaves a student who already caught up alone', async () => {
    // They went and did the work. Excusing them now would overwrite a real
    // completion with a waiver, which reads to everyone afterwards as though
    // they never did it.
    const done = absence({ caught_up_at: '2026-09-19T05:00:00Z' });
    const open = absence();
    const db = fakeSupabase({ nexus_class_absences: [done, open] });

    const { count } = await excuseClassObligations(db, CLASS, 'teacher-1');

    expect(count).toBe(1);
    expect(done.excuse_note).toBeNull();
    expect(done.caught_up_at).toBe('2026-09-19T05:00:00Z');
  });

  it('leaves an excuse a teacher already wrote by hand alone', async () => {
    const byHand = absence({
      excused_at: '2026-09-18T10:00:00Z',
      excused_by: 'teacher-2',
      excuse_note: 'Covered this with her in person.',
    });
    const db = fakeSupabase({ nexus_class_absences: [byHand, absence()] });

    const { count } = await excuseClassObligations(db, CLASS, 'teacher-1');

    expect(count).toBe(1);
    expect(byHand.excused_by).toBe('teacher-2');
    expect(byHand.excuse_note).toBe('Covered this with her in person.');
  });

  it('signs a machine excuse with nobody', async () => {
    // The sweep passes null, and that NULL is the whole difference between
    // "the system worked this out" and "a person decided this".
    const row = absence();
    const db = fakeSupabase({ nexus_class_absences: [row] });

    await excuseClassObligations(db, CLASS, null);

    expect(row.excused_by).toBeNull();
    expect(row.excuse_note).toBe(NOT_TAUGHT_NOTE);
  });

  it('is a no-op the second time', async () => {
    const rows = [absence(), absence()];
    const db = fakeSupabase({ nexus_class_absences: rows });

    await excuseClassObligations(db, CLASS, 'teacher-1');
    const second = await excuseClassObligations(db, CLASS, 'teacher-1');

    expect(second.count).toBe(0);
  });

  it('never reaches another class', async () => {
    const other = absence({ scheduled_class_id: 'class-2' });
    const db = fakeSupabase({ nexus_class_absences: [absence(), other] });

    const { count } = await excuseClassObligations(db, CLASS, 'teacher-1');

    expect(count).toBe(1);
    expect(other.excused_at).toBeNull();
  });
});

describe('putting the class back', () => {
  it('restores only what this feature excused', async () => {
    // The reason the note is a fixed sentinel rather than free text. A teacher
    // may have waived this class for one student for a reason of their own, and
    // an undo that swept that up would silently re-impose work somebody had
    // deliberately taken away.
    const ours = absence({
      excused_at: '2026-09-19T06:00:00Z',
      excused_by: 'teacher-1',
      excuse_note: NOT_TAUGHT_NOTE,
    });
    const theirs = absence({
      excused_at: '2026-09-18T10:00:00Z',
      excused_by: 'teacher-2',
      excuse_note: 'Covered this with her in person.',
    });
    const db = fakeSupabase({ nexus_class_absences: [ours, theirs] });

    const { count } = await restoreClassObligations(db, CLASS);

    expect(count).toBe(1);
    expect(ours.excused_at).toBeNull();
    expect(ours.excuse_note).toBeNull();
    expect(theirs.excused_at).toBe('2026-09-18T10:00:00Z');
  });

  it('leaves a student who finished it anyway finished', async () => {
    const finished = absence({
      excused_at: '2026-09-19T06:00:00Z',
      excuse_note: NOT_TAUGHT_NOTE,
      caught_up_at: '2026-09-19T07:00:00Z',
    });
    const db = fakeSupabase({ nexus_class_absences: [finished] });

    const { count } = await restoreClassObligations(db, CLASS);

    expect(count).toBe(0);
    expect(finished.caught_up_at).toBe('2026-09-19T07:00:00Z');
  });

  it('round trips', async () => {
    const rows = [absence(), absence()];
    const db = fakeSupabase({ nexus_class_absences: rows });

    await excuseClassObligations(db, CLASS, 'teacher-1');
    await restoreClassObligations(db, CLASS);

    expect(rows.every((r) => r.excused_at === null && r.excuse_note === null)).toBe(true);
  });
});

describe('telling our own cancellation apart from anyone else', () => {
  it('recognises the note', async () => {
    const db = fakeSupabase({
      nexus_class_absences: [absence({ excuse_note: NOT_TAUGHT_NOTE })],
      nexus_class_recaps: [],
    });

    expect(await wasMarkedNotTaught(db, CLASS)).toBe(true);
  });

  it('recognises the recap readiness on its own', async () => {
    // A class with no absence rows left, because everyone had already caught
    // up, still has to be undoable.
    const db = fakeSupabase({
      nexus_class_absences: [],
      nexus_class_recaps: [{ id: 'r-1', scheduled_class_id: CLASS, readiness: 'not_applicable' }],
    });

    expect(await wasMarkedNotTaught(db, CLASS)).toBe(true);
  });

  it('refuses a class cancelled some other way', async () => {
    // Load-bearing. Un-cancelling a class that genuinely never ran hands it
    // back to computeAbsencesForClass, which derives absences for anything not
    // cancelled, so the 21:00 cron would invent obligations for a session
    // nobody ever attended.
    const db = fakeSupabase({
      nexus_class_absences: [absence({ excuse_note: 'Covered this with her in person.' })],
      nexus_class_recaps: [{ id: 'r-1', scheduled_class_id: CLASS, readiness: 'held' }],
    });

    expect(await wasMarkedNotTaught(db, CLASS)).toBe(false);
  });

  it('refuses a class with nothing on it at all', async () => {
    const db = fakeSupabase({ nexus_class_absences: [], nexus_class_recaps: [] });

    expect(await wasMarkedNotTaught(db, CLASS)).toBe(false);
  });
});
