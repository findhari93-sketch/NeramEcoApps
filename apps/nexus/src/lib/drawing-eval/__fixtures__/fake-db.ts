/**
 * An in-memory stand-in for the service-role Supabase client, for the
 * automatic drafting tests.
 *
 * Unlike the loose stub in evaluate.test.ts, filters here really filter, and
 * drawing_evaluation enforces uq_drawing_evaluation_ai_live (one running or
 * draft AI row per submission) by answering 23505, which is the whole point:
 * the claim race can only be tested against something that refuses the second
 * claim the way Postgres does.
 *
 * Supports exactly the PostgREST surface the drafting code uses.
 */

type Row = Record<string, any>;
type Filter = (row: Row) => boolean;

export interface FakeDb {
  tables: Record<string, Row[]>;
  client: any;
}

const LIVE_AI = ['running', 'draft'];

function violatesAiLive(rows: Row[], candidate: Row, ignoreId?: string): boolean {
  if (candidate.source !== 'ai' || !LIVE_AI.includes(candidate.status)) return false;
  return rows.some(
    (r) =>
      r.id !== ignoreId &&
      r.submission_id === candidate.submission_id &&
      r.source === 'ai' &&
      LIVE_AI.includes(r.status),
  );
}

export function createFakeDb(seed: Record<string, Row[]> = {}, opts: { now?: () => Date } = {}): FakeDb {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((r) => ({ ...r }));
  let counter = 0;
  const now = opts.now ?? (() => new Date());

  function builder(table: string) {
    const rows = () => (tables[table] = tables[table] ?? []);
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let values: any = null;
    let returning = false;
    let countMode = false;
    const filters: Filter[] = [];
    let orderBy: { column: string; ascending: boolean } | null = null;
    let limitN: number | null = null;
    let rangeFrom: number | null = null;
    let rangeTo: number | null = null;

    const execute = (): { data: any; error: any; count?: number } => {
      if (op === 'insert') {
        const incoming = (Array.isArray(values) ? values : [values]).map((v: Row) => ({
          id: v.id ?? `${table}-${++counter}`,
          created_at: v.created_at ?? new Date(now().getTime() + counter).toISOString(),
          ...(table === 'drawing_evaluation' ? { source: 'ai' } : {}),
          ...v,
        }));
        if (table === 'drawing_evaluation') {
          for (const row of incoming) {
            if (violatesAiLive(rows(), row)) {
              return {
                data: null,
                error: { code: '23505', message: 'duplicate key value violates unique constraint "uq_drawing_evaluation_ai_live"' },
              };
            }
          }
        }
        rows().push(...incoming);
        return { data: returning ? incoming : null, error: null };
      }

      const matched = rows().filter((r) => filters.every((f) => f(r)));

      if (op === 'update') {
        if (table === 'drawing_evaluation') {
          for (const r of matched) {
            if (violatesAiLive(rows(), { ...r, ...values }, r.id)) {
              return { data: null, error: { code: '23505', message: 'duplicate key value' } };
            }
          }
        }
        for (const r of matched) Object.assign(r, values);
        return { data: returning ? matched.map((r) => ({ ...r })) : null, error: null };
      }

      if (op === 'delete') {
        tables[table] = rows().filter((r) => !matched.includes(r));
        return { data: returning ? matched : null, error: null };
      }

      let out = [...matched];
      if (orderBy) {
        const { column, ascending } = orderBy;
        out.sort((a, b) => {
          const av = a[column];
          const bv = b[column];
          if (av === bv) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          return (av < bv ? -1 : 1) * (ascending ? 1 : -1);
        });
      }
      if (rangeFrom !== null && rangeTo !== null) out = out.slice(rangeFrom, rangeTo + 1);
      if (limitN !== null) out = out.slice(0, limitN);
      if (countMode) return { data: null, error: null, count: out.length };
      return { data: out.map((r) => ({ ...r })), error: null };
    };

    const chain: any = {
      select: (_cols?: string, options?: { count?: string; head?: boolean }) => {
        if (op === 'select') {
          if (options?.head) countMode = true;
        } else {
          returning = true;
        }
        return chain;
      },
      insert: (v: any) => {
        op = 'insert';
        values = v;
        return chain;
      },
      update: (v: any) => {
        op = 'update';
        values = v;
        return chain;
      },
      delete: () => {
        op = 'delete';
        return chain;
      },
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), chain),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), chain),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), chain),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), chain),
      order: (column: string, o?: { ascending?: boolean }) => ((orderBy = { column, ascending: o?.ascending !== false }), chain),
      limit: (n: number) => ((limitN = n), chain),
      range: (from: number, to: number) => ((rangeFrom = from), (rangeTo = to), chain),
      maybeSingle: async () => {
        const res = execute();
        if (res.error) return res;
        const list = Array.isArray(res.data) ? res.data : [];
        return { data: list[0] ?? null, error: null };
      },
      single: async () => {
        const res = execute();
        if (res.error) return res;
        const list = Array.isArray(res.data) ? res.data : [];
        if (list.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'not exactly one row' } };
        return { data: list[0], error: null };
      },
      then: (resolve: any, reject?: any) => Promise.resolve(execute()).then(resolve, reject),
    };
    return chain;
  }

  return { tables, client: { from: (table: string) => builder(table) } };
}
