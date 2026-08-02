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

export function createFakeDb(seed: FakeTables): FakeDb {
  const tables: FakeTables = JSON.parse(JSON.stringify(seed));
  let autoId = 0;

  function builder(table: string) {
    const filters: Array<(r: any) => boolean> = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: any = null;
    let wantCount = false;
    let orderKey: string | null = null;
    let rowLimit: number | null = null;

    const rows = () => (tables[table] ||= []);
    const matched = () => rows().filter((r) => filters.every((f) => f(r)));

    const run = () => {
      if (op === 'insert') {
        const arr = Array.isArray(payload) ? payload : [payload];
        const created = arr.map((r) => ({ id: r.id ?? `${table}-${++autoId}`, ...r }));
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
