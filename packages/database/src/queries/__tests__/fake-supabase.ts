/**
 * A small in-memory stand-in for the Supabase query builder, enough for the
 * identity resolvers: select/insert/update with eq, neq, ilike, or(), order,
 * limit, single/maybeSingle. Rows live in plain arrays so a test can assert the
 * end state. Unique constraints are declared per table and raise 23505.
 */

type Row = Record<string, any>;
type Filter = (row: Row) => boolean;

function ilikeMatch(value: unknown, pattern: string): boolean {
  if (typeof value !== 'string') return false;
  // Unescape \\, \%, \_ into literals; bare % and _ are wildcards.
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\' && i + 1 < pattern.length) {
      re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else if (c === '%') re += '.*';
    else if (c === '_') re += '.';
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i').test(value);
}

function parseOr(expr: string): Filter {
  const parts = expr.split(',').map((p) => {
    const [col, op, ...rest] = p.split('.');
    const val = rest.join('.');
    if (op === 'eq') return (r: Row) => String(r[col] ?? '') === val;
    if (op === 'ilike') return (r: Row) => ilikeMatch(r[col], val);
    throw new Error(`fake or(): unsupported op ${op}`);
  });
  return (r) => parts.some((f) => f(r));
}

export function createFakeSupabase(
  seed: Record<string, Row[]> = {},
  unique: Record<string, string[][]> = {},
) {
  const tables: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(seed)) tables[t] = rows.map((r) => ({ ...r }));
  let seq = 0;
  const table = (t: string) => (tables[t] = tables[t] || []);

  function violates(t: string, candidate: Row, selfId?: string): boolean {
    for (const cols of unique[t] || []) {
      if (cols.some((c) => candidate[c] == null)) continue;
      if (table(t).some((r) => r.id !== selfId && cols.every((c) => r[c] === candidate[c]))) return true;
    }
    return false;
  }

  function builder(t: string) {
    const filters: Filter[] = [];
    let mode: 'select' | 'insert' | 'update' = 'select';
    let payload: Row | Row[] | null = null;
    let orders: Array<[string, boolean]> = [];
    let limit: number | null = null;
    let returning = false;

    const run = () => {
      if (mode === 'insert') {
        const rows = (Array.isArray(payload) ? payload : [payload]) as Row[];
        const out: Row[] = [];
        for (const r of rows) {
          const row = { id: r.id ?? `${t}-${++seq}`, created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString(), ...r };
          if (violates(t, row)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
          table(t).push(row);
          out.push({ ...row });
        }
        return { data: out, error: null };
      }
      let rows = table(t).filter((r) => filters.every((f) => f(r)));
      if (mode === 'update') {
        for (const r of rows) {
          const next = { ...r, ...(payload as Row) };
          if (violates(t, next, r.id)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
          Object.assign(r, payload);
        }
        rows = rows.map((r) => ({ ...r }));
        return { data: returning ? rows : null, error: null };
      }
      for (const [col, asc] of [...orders].reverse()) {
        rows = [...rows].sort((a, b) => {
          const av = a[col] ?? null;
          const bv = b[col] ?? null;
          if (av === bv) return 0;
          if (av === null) return 1;
          if (bv === null) return -1;
          return (av < bv ? -1 : 1) * (asc ? 1 : -1);
        });
      }
      if (limit !== null) rows = rows.slice(0, limit);
      return { data: rows.map((r) => ({ ...r })), error: null };
    };

    const b: any = {
      select: () => {
        if (mode !== 'select') returning = true;
        return b;
      },
      insert: (p: Row | Row[]) => ((mode = 'insert'), (payload = p), b),
      update: (p: Row) => ((mode = 'update'), (payload = p), b),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), b),
      ilike: (c: string, p: string) => (filters.push((r) => ilikeMatch(r[c], p)), b),
      or: (expr: string) => (filters.push(parseOr(expr)), b),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), b),
      order: (c: string, o: { ascending?: boolean } = {}) => (orders.push([c, o.ascending !== false]), b),
      limit: (n: number) => ((limit = n), b),
      maybeSingle: async () => {
        const { data, error } = run();
        if (error) return { data: null, error };
        if (!data || data.length === 0) return { data: null, error: null };
        if (data.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
        return { data: data[0], error: null };
      },
      single: async () => {
        const { data, error } = run();
        if (error) return { data: null, error };
        if (!data || data.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'not exactly one row' } };
        return { data: data[0], error: null };
      },
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
        try {
          resolve(run());
        } catch (e) {
          reject?.(e);
        }
      },
    };
    return b;
  }

  return { client: { from: (t: string) => builder(t) } as any, tables };
}
