/**
 * A tiny in-memory stand-in for the Supabase client, for the payments service
 * tests. It covers only what those services use: from().select/insert/update
 * with eq/neq/in/is/lt/lte/gt/gte/limit/order/maybeSingle/single, and rpc(). Not a test file
 * itself (vitest collects *.test.ts), so it is shared by several of them.
 */
import { vi } from 'vitest';

type Row = Record<string, any>;

export interface FakeDb {
  tables: Record<string, Row[]>;
  rpcCalls: { fn: string; args: any }[];
  rpcResult: (fn: string, args: any) => any;
  /** Optional unique-index stand-in: return an error object to refuse an insert (e.g. { code: '23505' }). */
  uniqueCheck: ((table: string, row: Row, rows: Row[]) => { code: string; message: string } | null) | null;
  client: any;
  rows(table: string): Row[];
}

let seq = 0;
const newId = () => `id-${++seq}`;

export function fakeDb(seed: Record<string, Row[]> = {}): FakeDb {
  const tables: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(seed)) tables[t] = rows.map((r) => ({ ...r }));
  const rpcCalls: { fn: string; args: any }[] = [];
  const db: FakeDb = {
    tables,
    rpcCalls,
    rpcResult: () => ({ ok: true }),
    uniqueCheck: null,
    rows: (t) => (tables[t] ||= []),
    client: null,
  };

  const matches = (row: Row, filters: any[]) =>
    filters.every(([op, col, val]) => {
      if (op === 'eq') return row[col] === val;
      if (op === 'neq') return row[col] !== val;
      if (op === 'in') return (val as any[]).includes(row[col]);
      if (op === 'is') return row[col] === val || (val === null && row[col] === undefined);
      if (op === 'lt') return row[col] !== undefined && row[col] !== null && row[col] < val;
      if (op === 'lte') return row[col] !== undefined && row[col] !== null && row[col] <= val;
      if (op === 'gt') return row[col] !== undefined && row[col] !== null && row[col] > val;
      if (op === 'gte') return row[col] !== undefined && row[col] !== null && row[col] >= val;
      if (op === 'contains') {
        const have = row[col];
        return !!have && typeof have === 'object' && Object.entries(val).every(([k, v]) => have[k] === v);
      }
      return true;
    });

  function from(table: string) {
    const rows = db.rows(table);
    let op: 'select' | 'insert' | 'update' | 'upsert' = 'select';
    let payload: any = null;
    let upsertOpts: any = null;
    const filters: any[] = [];
    let limit: number | null = null;

    let insertError: { code: string; message: string } | null = null;
    const run = () => {
      if (op === 'upsert') {
        const list = Array.isArray(payload) ? payload : [payload];
        const keys: string[] = String(upsertOpts?.onConflict || 'id').split(',').map((k: string) => k.trim());
        const out: Row[] = [];
        for (const r of list) {
          const hit = rows.find((x) => keys.every((k) => x[k] === r[k]));
          if (hit) {
            if (!upsertOpts?.ignoreDuplicates) Object.assign(hit, r);
            out.push(hit);
          } else {
            const row = { id: newId(), created_at: new Date().toISOString(), ...r };
            rows.push(row);
            out.push(row);
          }
        }
        return out;
      }
      if (op === 'insert') {
        const list = Array.isArray(payload) ? payload : [payload];
        const inserted: Row[] = [];
        for (const r of list) {
          const err = db.uniqueCheck ? db.uniqueCheck(table, r, rows) : null;
          if (err) {
            insertError = err;
            return [];
          }
          const row = { id: newId(), created_at: new Date().toISOString(), ...r };
          rows.push(row);
          inserted.push(row);
        }
        return inserted;
      }
      const hit = rows.filter((r) => matches(r, filters));
      if (op === 'update') {
        hit.forEach((r) => Object.assign(r, payload));
      }
      return limit === null ? hit : hit.slice(0, limit);
    };

    const api: any = {
      select: () => api,
      insert: (p: any) => ((op = 'insert'), (payload = p), api),
      upsert: (p: any, opts?: any) => ((op = 'upsert'), (payload = p), (upsertOpts = opts || null), api),
      update: (p: any) => ((op = 'update'), (payload = p), api),
      eq: (c: string, v: any) => (filters.push(['eq', c, v]), api),
      neq: (c: string, v: any) => (filters.push(['neq', c, v]), api),
      in: (c: string, v: any[]) => (filters.push(['in', c, v]), api),
      is: (c: string, v: any) => (filters.push(['is', c, v]), api),
      lt: (c: string, v: any) => (filters.push(['lt', c, v]), api),
      lte: (c: string, v: any) => (filters.push(['lte', c, v]), api),
      gt: (c: string, v: any) => (filters.push(['gt', c, v]), api),
      gte: (c: string, v: any) => (filters.push(['gte', c, v]), api),
      contains: (c: string, v: any) => (filters.push(['contains', c, v]), api),
      order: () => api,
      limit: (n: number) => ((limit = n), api),
      maybeSingle: async () => {
        const out = run();
        return insertError ? { data: null, error: insertError } : { data: out[0] ?? null, error: null };
      },
      single: async () => {
        const [first] = run();
        if (insertError) return { data: null, error: insertError };
        return first ? { data: first, error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      },
      then: (resolve: any, reject?: any) => {
        const out = run();
        return Promise.resolve(insertError ? { data: null, error: insertError } : { data: out, error: null }).then(resolve, reject);
      },
    };
    return api;
  }

  db.client = {
    from: vi.fn(from),
    rpc: vi.fn(async (fn: string, args: any) => {
      rpcCalls.push({ fn, args });
      const out = db.rpcResult(fn, args);
      return out && out.__error ? { data: null, error: out.__error } : { data: out, error: null };
    }),
  };
  return db;
}
