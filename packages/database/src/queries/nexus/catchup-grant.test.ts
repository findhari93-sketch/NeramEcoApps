import { describe, expect, it } from 'vitest';
import { grantCatchupTestWindow } from './test-access';

/**
 * Who the automatic catch-up grant may open a door for, and who it must not.
 *
 * Two rules meet here and they pull in opposite directions. A student who
 * finishes catching up has EARNED a sitting and should not have to ask. A
 * teacher who has already said no has DECIDED, and no automatic rule may
 * overrule a person.
 *
 * The second one was unenforceable until 2026-09-12: uq_test_access_live is a
 * partial index over ('pending','granted'), so a declined row is invisible to
 * getLiveAccessRequest and this function wrote a grant straight over it.
 */

interface Row {
  id: string;
  placement_id: string;
  student_id: string;
  source: string;
  status: string;
  opens_at: string | null;
  closes_at: string | null;
  decided_by: string | null;
  decision_note?: string | null;
}

const PLACEMENT = 'p-exam';
const STUDENT = 'stu-1';

const row = (over: Partial<Row> = {}): Row => ({
  id: 'r1',
  placement_id: PLACEMENT,
  student_id: STUDENT,
  source: 'student_request',
  status: 'pending',
  opens_at: null,
  closes_at: null,
  decided_by: null,
  ...over,
});

/**
 * Enough of PostgREST to exercise the branch order: equality filters, the
 * status `in`, and the `not('decided_by','is',null)` that finds a human's no.
 */
function stub(seed: Row[]) {
  const rows = [...seed];
  const writes: Array<{ op: string; payload: any }> = [];

  const client = {
    from() {
      const st = {
        op: 'select' as 'select' | 'insert' | 'update',
        eq: {} as Record<string, unknown>,
        statuses: null as string[] | null,
        notNull: [] as string[],
        payload: null as any,
      };
      const matching = () =>
        rows.filter(
          (r) =>
            Object.entries(st.eq).every(([k, v]) => (r as any)[k] === v) &&
            (!st.statuses || st.statuses.includes(r.status)) &&
            st.notNull.every((c) => (r as any)[c] != null),
        );
      const run = (single: boolean) => {
        if (st.op === 'insert') {
          const created = { id: 'r' + (rows.length + 1), ...st.payload } as Row;
          rows.push(created);
          writes.push({ op: 'insert', payload: st.payload });
          return Promise.resolve({ data: created, error: null });
        }
        if (st.op === 'update') {
          const hit = matching();
          for (const r of hit) Object.assign(r, st.payload);
          writes.push({ op: 'update', payload: st.payload });
          return Promise.resolve({ data: hit[0] ?? null, error: null });
        }
        const m = matching();
        return Promise.resolve({ data: single ? (m[0] ?? null) : m, error: null });
      };
      const chain: any = {
        select: () => chain,
        insert: (v: any) => {
          st.op = 'insert';
          st.payload = v;
          return chain;
        },
        update: (v: any) => {
          st.op = 'update';
          st.payload = v;
          return chain;
        },
        eq: (c: string, v: unknown) => {
          st.eq[c] = v;
          return chain;
        },
        in: (c: string, v: string[]) => {
          if (c === 'status') st.statuses = v;
          return chain;
        },
        not: (c: string) => {
          st.notNull.push(c);
          return chain;
        },
        limit: () => chain,
        maybeSingle: () => run(true),
        then: (ok: any, bad?: any) => run(false).then(ok, bad),
      };
      return chain;
    },
  };

  return { client: client as never, rows, writes };
}

describe('grantCatchupTestWindow', () => {
  it('opens the door for a student holding nothing, which is the whole rule', async () => {
    const { client, writes } = stub([]);

    expect(await grantCatchupTestWindow({ placementId: PLACEMENT, studentId: STUDENT }, client)).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0].op).toBe('insert');
    expect(writes[0].payload.status).toBe('granted');
    expect(writes[0].payload.source).toBe('catchup_auto');
    // Automatic, so no person decided it. Teacher grants carry an actor id.
    expect(writes[0].payload.decided_by).toBeNull();
  });

  it('gives seven days, not three', async () => {
    const { client, writes } = stub([]);
    const before = Date.now();

    await grantCatchupTestWindow({ placementId: PLACEMENT, studentId: STUDENT }, client);

    const days = (Date.parse(writes[0].payload.closes_at) - before) / 86400000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it('leaves an existing granted row alone rather than widening it', async () => {
    const { client, writes } = stub([
      row({ status: 'granted', source: 'teacher_grant', closes_at: '2999-01-01T00:00:00Z', decided_by: 'staff-1' }),
    ]);

    expect(await grantCatchupTestWindow({ placementId: PLACEMENT, studentId: STUDENT }, client)).toBe(false);
    expect(writes).toHaveLength(0);
  });

  it('is idempotent: running twice opens one door', async () => {
    const { client, writes } = stub([]);

    expect(await grantCatchupTestWindow({ placementId: PLACEMENT, studentId: STUDENT }, client)).toBe(true);
    expect(await grantCatchupTestWindow({ placementId: PLACEMENT, studentId: STUDENT }, client)).toBe(false);
    expect(writes).toHaveLength(1);
  });

  /**
   * This used to return false. A student who asked politely AND then earned the
   * sitting was refused for having asked, and waited days for a decision the
   * rule had already made.
   */
  it('upgrades the pending ask a student raised instead of refusing them for asking', async () => {
    const { client, rows, writes } = stub([row({ status: 'pending', source: 'student_request' })]);

    expect(await grantCatchupTestWindow({ placementId: PLACEMENT, studentId: STUDENT }, client)).toBe(true);
    expect(writes[0].op).toBe('update');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('granted');
    // The ask is resolved in place, so the teacher's inbox item is answered
    // rather than left hanging, and the trail still says who raised it.
    expect(rows[0].source).toBe('student_request');
    expect(rows[0].decision_note).toBe('Opened automatically when you finished your catch-up.');
  });

  it('does not answer a pending row that the student did not raise', async () => {
    const { client, writes } = stub([row({ status: 'pending', source: 'teacher_grant' })]);

    expect(await grantCatchupTestWindow({ placementId: PLACEMENT, studentId: STUDENT }, client)).toBe(false);
    expect(writes).toHaveLength(0);
  });

  it('does not overrule a teacher who declined, even though the live check cannot see it', async () => {
    const { client, writes } = stub([row({ status: 'declined', decided_by: 'staff-1' })]);

    expect(await grantCatchupTestWindow({ placementId: PLACEMENT, studentId: STUDENT }, client)).toBe(false);
    expect(writes).toHaveLength(0);
  });

  it('does not overrule a teacher who revoked a window', async () => {
    const { client, writes } = stub([row({ status: 'revoked', decided_by: 'staff-1' })]);

    expect(await grantCatchupTestWindow({ placementId: PLACEMENT, studentId: STUDENT }, client)).toBe(false);
    expect(writes).toHaveLength(0);
  });

  /**
   * decided_by is null on every automatic write, so a revoked catchup_auto row
   * must not read as a refusal. Otherwise one expired automatic window would
   * lock a student out of every door their later catch-up earns.
   */
  it('treats a revoked automatic grant as no decision at all', async () => {
    const { client } = stub([row({ status: 'revoked', source: 'catchup_auto', decided_by: null })]);

    expect(await grantCatchupTestWindow({ placementId: PLACEMENT, studentId: STUDENT }, client)).toBe(true);
  });

  it('never lets a write failure surface as a failed catch-up', async () => {
    const exploding = {
      from() {
        throw new Error('database is on fire');
      },
    } as never;

    expect(await grantCatchupTestWindow({ placementId: PLACEMENT, studentId: STUDENT }, exploding)).toBe(false);
  });
});
