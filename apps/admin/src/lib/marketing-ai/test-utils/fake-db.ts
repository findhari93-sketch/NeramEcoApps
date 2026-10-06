/**
 * A tiny in-memory stand-in for the Supabase query builder, for the agent's
 * tests only. It covers the calls lib/marketing-ai makes (select, insert,
 * update, upsert and the filters below) and nothing more. Projections are
 * ignored: every column comes back.
 */

type Row = Record<string, any>;
type Filter = (r: Row) => boolean;

let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

export function createFakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  const table = (name: string) => (tables[name] ??= []);

  function builder(name: string) {
    let op: 'select' | 'insert' | 'update' | 'upsert' = 'select';
    let payload: any = null;
    let conflict: string[] = [];
    let returning = false;
    let head = false;
    let wantCount = false;
    let single: 'single' | 'maybe' | null = null;
    let limit: number | null = null;
    let range: [number, number] | null = null;
    const orders: Array<[string, boolean]> = [];
    const filters: Filter[] = [];

    const q: any = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (op === 'select') {
          head = !!opts?.head;
          wantCount = !!opts?.count;
        } else returning = true;
        return q;
      },
      insert(rows: Row | Row[]) {
        op = 'insert';
        payload = Array.isArray(rows) ? rows : [rows];
        return q;
      },
      update(patch: Row) {
        op = 'update';
        payload = patch;
        return q;
      },
      upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
        op = 'upsert';
        payload = Array.isArray(rows) ? rows : [rows];
        conflict = (opts?.onConflict || 'id').split(',').map((s) => s.trim());
        return q;
      },
      eq: (c: string, v: any) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: any) => (filters.push((r) => r[c] !== v), q),
      in: (c: string, vs: any[]) => (filters.push((r) => vs.includes(r[c])), q),
      gte: (c: string, v: any) => (filters.push((r) => r[c] >= v), q),
      gt: (c: string, v: any) => (filters.push((r) => r[c] > v), q),
      lte: (c: string, v: any) => (filters.push((r) => r[c] <= v), q),
      lt: (c: string, v: any) => (filters.push((r) => r[c] < v), q),
      is: (c: string, v: any) => (filters.push((r) => (r[c] ?? null) === v), q),
      // Only .not(col, 'is', null) is used.
      not: (c: string, _op: string, v: any) => (filters.push((r) => (r[c] ?? null) !== v), q),
      ilike: (c: string, pattern: string) => {
        const re = new RegExp(`^${pattern.replace(/%/g, '.*')}$`, 'i');
        return filters.push((r) => re.test(String(r[c] ?? ''))), q;
      },
      or: (expr: string) => {
        // Only "col.not.is.null,col2.not.is.null" is used.
        const cols = expr.split(',').map((p) => p.split('.')[0]);
        return filters.push((r) => cols.some((c) => r[c] !== null && r[c] !== undefined)), q;
      },
      order: (c: string, o?: { ascending?: boolean }) => (orders.push([c, o?.ascending !== false]), q),
      limit: (n: number) => ((limit = n), q),
      range: (a: number, b: number) => ((range = [a, b]), q),
      single: () => ((single = 'single'), q),
      maybeSingle: () => ((single = 'maybe'), q),
      then(resolve: (v: any) => void, reject: (e: any) => void) {
        try {
          resolve(run());
        } catch (e) {
          reject(e);
        }
      },
    };

    function run() {
      const rows = table(name);
      const now = new Date().toISOString();
      let out: Row[] = [];
      if (op === 'insert') {
        out = payload.map((p: Row) => {
          const r = { id: newId(), created_at: now, updated_at: now, ...p };
          rows.push(r);
          return r;
        });
      } else if (op === 'upsert') {
        out = payload.map((p: Row) => {
          const existing = rows.find((r) => conflict.every((c) => r[c] === p[c]));
          if (existing) return Object.assign(existing, p);
          const r = { id: newId(), created_at: now, ...p };
          rows.push(r);
          return r;
        });
      } else if (op === 'update') {
        out = rows.filter((r) => filters.every((f) => f(r)));
        out.forEach((r) => Object.assign(r, payload));
      } else {
        out = rows.filter((r) => filters.every((f) => f(r)));
      }

      if (op !== 'select' && !returning) return { data: null, error: null };
      out = [...out];
      for (const [c, asc] of [...orders].reverse()) out.sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (asc ? 1 : -1));
      const count = out.length;
      if (range) out = out.slice(range[0], range[1] + 1);
      if (limit !== null) out = out.slice(0, limit);
      if (head) return { data: null, error: null, count };
      // Copies, like a real database: a caller holding a row must not see later updates.
      if (single === 'single') return out.length === 1 ? { data: { ...out[0] }, error: null } : { data: null, error: { message: `expected 1 row, got ${out.length}` } };
      if (single === 'maybe') return { data: out[0] ? { ...out[0] } : null, error: null };
      return { data: out.map((r) => ({ ...r })), error: null, count: wantCount ? count : null };
    }

    return q;
  }

  return { from: (name: string) => builder(name), tables };
}
