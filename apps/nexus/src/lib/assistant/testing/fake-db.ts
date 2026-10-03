/**
 * Enough of the supabase-js query builder to test the assistant's store and
 * writers without a database: from, select, insert, upsert, update, delete,
 * eq, neq, in, is, lte, gte, lt, gt, or (ignored), order, limit, maybeSingle,
 * single, and awaiting the chain. `unique` emulates a unique index with error
 * code 23505.
 */
export type Row = Record<string, any>;

export interface FakeDbOptions {
  /** table -> list of column groups that must be unique together. */
  unique?: Record<string, string[][]>;
}

let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
/** Strictly increasing timestamps, so ordering by created_at matches insert order as it does in Postgres. */
let clock = 0;
const stamp = () => {
  clock = Math.max(Date.now(), clock + 1);
  return new Date(clock).toISOString();
};

export function fakeDb(tables: Record<string, Row[]>, opts: FakeDbOptions = {}) {
  const data: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(tables)) data[name] = rows.map((r) => ({ ...r }));

  function table(name: string): Row[] {
    if (!data[name]) data[name] = [];
    return data[name];
  }

  function violates(name: string, row: Row): boolean {
    const groups = opts.unique?.[name] || [];
    return groups.some(
      (cols) =>
        cols.every((c) => row[c] !== null && row[c] !== undefined) &&
        table(name).some((r) => cols.every((c) => r[c] === row[c])),
    );
  }

  function chain(name: string) {
    type Filter = (r: Row) => boolean;
    const filters: Filter[] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
    let payload: Row | Row[] | null = null;
    let upsertKeys: string[] = [];
    let orderBy: { col: string; asc: boolean } | null = null;
    let take: number | null = null;
    let single: 'maybe' | 'one' | null = null;

    const run = (): { data: any; error: any } => {
      const rows = table(name);
      const matching = () => rows.filter((r) => filters.every((f) => f(r)));
      let out: Row[] = [];
      if (op === 'insert') {
        const list = Array.isArray(payload) ? payload : [payload as Row];
        for (const r of list) {
          const row = { id: newId(), created_at: stamp(), ...r };
          if (violates(name, row)) {
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
          }
          rows.push(row);
          out.push(row);
        }
      } else if (op === 'upsert') {
        const r = payload as Row;
        const existing = rows.find((x) => upsertKeys.every((k) => x[k] === r[k]));
        if (existing) {
          Object.assign(existing, r);
          out = [existing];
        } else {
          const row = { id: newId(), created_at: stamp(), ...r };
          rows.push(row);
          out = [row];
        }
      } else if (op === 'update') {
        out = matching();
        for (const r of out) Object.assign(r, payload);
      } else if (op === 'delete') {
        out = matching();
        for (const r of out) rows.splice(rows.indexOf(r), 1);
      } else {
        out = matching();
      }
      if (orderBy) {
        const { col, asc } = orderBy;
        out = [...out].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1));
      }
      if (take !== null) out = out.slice(0, take);
      if (single === 'one') {
        if (out.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
        return { data: out[0], error: null };
      }
      if (single === 'maybe') return { data: out[0] ?? null, error: null };
      return { data: out, error: null };
    };

    const api: any = {
      select: () => api,
      insert: (p: Row | Row[]) => { op = 'insert'; payload = p; return api; },
      upsert: (p: Row, o?: { onConflict?: string }) => { op = 'upsert'; payload = p; upsertKeys = (o?.onConflict || 'id').split(',').map((s) => s.trim()); return api; },
      update: (p: Row) => { op = 'update'; payload = p; return api; },
      delete: () => { op = 'delete'; return api; },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api; },
      neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return api; },
      in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return api; },
      is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return api; },
      lte: (c: string, v: any) => { filters.push((r) => r[c] <= v); return api; },
      gte: (c: string, v: any) => { filters.push((r) => r[c] >= v); return api; },
      lt: (c: string, v: any) => { filters.push((r) => r[c] < v); return api; },
      gt: (c: string, v: any) => { filters.push((r) => r[c] > v); return api; },
      or: () => api,
      order: (c: string, o?: { ascending?: boolean }) => { orderBy = { col: c, asc: o?.ascending !== false }; return api; },
      limit: (n: number) => { take = n; return api; },
      maybeSingle: () => { single = 'maybe'; return api; },
      single: () => { single = 'one'; return api; },
      then: (res: (v: any) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    };
    return api;
  }

  return {
    from: (name: string) => chain(name),
    /** Peek at a table in assertions. */
    rows: (name: string) => table(name),
  };
}
