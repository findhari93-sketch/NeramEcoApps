/**
 * A small in-memory stand-in for the PostgREST query builder, for query tests
 * that need to assert what the DATA looks like afterwards rather than which
 * calls were made. A chainable call-spy cannot tell you whether a row survived.
 *
 * Lives here rather than inside a .test.ts so more than one suite can seed the
 * same tables. Test-only: nothing under src/queries imports it.
 *
 * Deliberately partial. It understands eq/is/in/order and the select-insert-
 * update-delete verbs, and it IGNORES the column list, so an embedded select
 * (`sections:foo(*)`) comes back absent rather than populated. Code that reads
 * an embed needs a real database or a separate lookup; that is a feature, since
 * a fake that silently invented embeds would make untested code look tested.
 */

export interface FakeTables {
  [table: string]: any[];
}

export interface FakeDb {
  client: any;
  tables: FakeTables;
}

/**
 * Column defaults, per table, applied to inserted rows.
 *
 * Postgres fills these in; a fake that does not will make code that inserts a row
 * and reads it straight back look broken when it is not. `is_active BOOLEAN NOT
 * NULL DEFAULT true` is the one that bites: the insert omits it on purpose, and
 * every read filters on it.
 */
export interface FakeDefaults {
  [table: string]: Record<string, unknown>;
}

export function createFakeDb(seed: FakeTables, defaults: FakeDefaults = {}): FakeDb {
  const tables: FakeTables = JSON.parse(JSON.stringify(seed));
  let autoId = 0;

  function builder(table: string) {
    const filters: Array<(r: any) => boolean> = [];
    let op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
    let payload: any = null;
    let conflictCols: string[] = [];
    let ignoreDuplicates = false;
    let wantCount = false;
    let orderKey: string | null = null;
    let rowLimit: number | null = null;

    const rows = () => (tables[table] ||= []);
    const matched = () => rows().filter((r) => filters.every((f) => f(r)));

    const run = () => {
      if (op === 'upsert') {
        // Enough of ON CONFLICT to test idempotency: a row whose conflict
        // columns match an existing one is skipped when ignoreDuplicates is
        // set and merged into it otherwise. Rows with a NULL in any conflict
        // column never collide, which mirrors a partial unique index and is
        // exactly the case queueExamDrawings relies on.
        const arr = Array.isArray(payload) ? payload : [payload];
        const created: any[] = [];
        for (const r of arr) {
          const collides =
            conflictCols.length > 0 &&
            conflictCols.every((c) => r[c] !== null && r[c] !== undefined) &&
            rows().find((existing) => conflictCols.every((c) => existing[c] === r[c]));
          if (collides) {
            // A real upsert-with-select returns the row whether it was inserted
            // or updated by the conflict, so a caller doing
            // `.upsert(...).select().single()` to re-read a just-granted row
            // (e.g. re-granting a makeup or an attempt override) gets it back.
            // ON CONFLICT DO NOTHING (ignoreDuplicates) truly returns nothing
            // for the skipped row, so that case stays excluded.
            if (!ignoreDuplicates) {
              Object.assign(collides, r);
              created.push(collides);
            }
            continue;
          }
          const row = { id: r.id ?? `${table}-${++autoId}`, ...(defaults[table] || {}), ...r };
          rows().push(row);
          created.push(row);
        }
        return { data: created, error: null, count: created.length };
      }
      if (op === 'insert') {
        const arr = Array.isArray(payload) ? payload : [payload];
        const created = arr.map((r) => ({
          id: r.id ?? `${table}-${++autoId}`,
          ...(defaults[table] || {}),
          ...r,
        }));
        rows().push(...created);
        return { data: created, error: null, count: created.length };
      }
      if (op === 'update') {
        const hit = matched();
        hit.forEach((r) => Object.assign(r, payload));
        return { data: hit, error: null, count: hit.length };
      }
      if (op === 'delete') {
        const hit = matched();
        tables[table] = rows().filter((r) => !hit.includes(r));
        return { data: hit, error: null, count: hit.length };
      }
      let out = matched();
      if (orderKey) {
        const k = orderKey;
        out = [...out].sort((a, b) => (a[k] ?? 0) - (b[k] ?? 0));
      }
      if (rowLimit != null) out = out.slice(0, rowLimit);
      return { data: out, error: null, count: out.length };
    };

    const chain: any = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.count) wantCount = true;
        return chain;
      },
      insert(v: any) {
        op = 'insert';
        payload = v;
        return chain;
      },
      upsert(v: any, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
        op = 'upsert';
        payload = v;
        conflictCols = (opts?.onConflict || '')
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean);
        ignoreDuplicates = opts?.ignoreDuplicates === true;
        return chain;
      },
      update(v: any) {
        op = 'update';
        payload = v;
        return chain;
      },
      delete() {
        op = 'delete';
        return chain;
      },
      eq(col: string, val: any) {
        filters.push((r) => r[col] === val);
        return chain;
      },
      is(col: string, val: any) {
        // PostgREST .is(col, null) matches SQL NULL. Rows written before the
        // column existed have undefined, which must match too.
        if (val === null) filters.push((r) => r[col] === null || r[col] === undefined);
        else filters.push((r) => r[col] === val);
        return chain;
      },
      in(col: string, vals: any[]) {
        filters.push((r) => vals.includes(r[col]));
        return chain;
      },
      order(col: string) {
        orderKey = col;
        return chain;
      },
      limit(n: number) {
        rowLimit = n;
        return chain;
      },
      neq(col: string, val: any) {
        filters.push((r) => r[col] !== val);
        return chain;
      },
      gte(col: string, val: any) {
        filters.push((r) => r[col] != null && r[col] >= val);
        return chain;
      },
      /**
       * PostgREST's row window. Callers use it to lift the default 1000-row cap
       * on a tally query, so the honest fake is an inclusive slice.
       */
      range(from: number, to: number) {
        rowLimit = null;
        const slice = { from, to };
        const prev = chain.then;
        chain.then = (resolve: any) =>
          prev((res: any) =>
            resolve(
              Array.isArray(res.data)
                ? { ...res, data: res.data.slice(slice.from, slice.to + 1) }
                : res,
            ),
          );
        return chain;
      },
      single: async () => {
        const res = run();
        const row = (res.data || [])[0];
        return row ? { data: row, error: null } : { data: null, error: { message: 'no rows' } };
      },
      maybeSingle: async () => {
        const res = run();
        return { data: (res.data || [])[0] ?? null, error: null };
      },
      then: (resolve: any) => {
        const res = run();
        return resolve(wantCount ? { ...res, data: null } : res);
      },
    };
    return chain;
  }

  return {
    client: { from: (t: string) => builder(t) } as any,
    tables,
  };
}
