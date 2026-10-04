// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { getUserJourneyDetail, getRevenueByYear, mapRevenueByYearRows, JOURNEY_COLUMNS } from './crm';

type Call = [string, unknown[]];

/**
 * Recording fake of the Supabase builder. Every chained call is logged per
 * query; awaiting (or .single / .maybeSingle) answers from `respond(table, calls)`.
 */
function recordingDb(respond: (table: string, calls: Call[]) => { data: unknown; error?: unknown }) {
  const queries: Array<{ table: string; calls: Call[] }> = [];
  const from = (table: string) => {
    const calls: Call[] = [];
    queries.push({ table, calls });
    const answer = () => Promise.resolve({ error: null, ...respond(table, calls) });
    const builder: any = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') return (res: any, rej: any) => answer().then(res, rej);
          if (prop === 'single' || prop === 'maybeSingle') {
            return () => {
              calls.push([prop, []]);
              return answer();
            };
          }
          return (...args: unknown[]) => {
            calls.push([prop, args]);
            return builder;
          };
        },
      },
    );
    return builder;
  };
  return { db: { from } as any, queries };
}

const has = (calls: Call[], method: string, ...args: unknown[]) =>
  calls.some(([m, a]) => m === method && args.every((v, i) => JSON.stringify(a[i]) === JSON.stringify(v)));

describe('getUserJourneyDetail', () => {
  it('scopes installments and the scholarship to the user application in SQL', async () => {
    const { db, queries } = recordingDb((table, calls) => {
      if (table === 'users') return { data: { id: 'u1', phone_verified: true } };
      if (table === 'lead_profiles') return { data: { id: 'lp1', status: 'submitted' } };
      if (table === 'payment_installments') return { data: [{ id: 'i1', lead_profile_id: 'lp1', installment_number: 1 }] };
      if (table === 'scholarship_applications') return { data: { id: 's1', lead_profile_id: 'lp1' } };
      const single = calls.some(([m]) => m === 'maybeSingle' || m === 'single');
      return { data: single ? null : [] };
    });

    const detail = await getUserJourneyDetail('u1', db);
    expect(detail?.installments).toEqual([{ id: 'i1', lead_profile_id: 'lp1', installment_number: 1 }]);
    expect(detail?.scholarshipApplication).toEqual({ id: 's1', lead_profile_id: 'lp1' });
    expect(detail?.pipelineStage).toBe('application_submitted');

    const inst = queries.find((q) => q.table === 'payment_installments')!;
    expect(has(inst.calls, 'eq', 'lead_profile_id', 'lp1')).toBe(true);
    expect(has(inst.calls, 'select', JOURNEY_COLUMNS.installments)).toBe(true);

    const sch = queries.find((q) => q.table === 'scholarship_applications')!;
    expect(has(sch.calls, 'eq', 'lead_profile_id', 'lp1')).toBe(true);
    expect(has(sch.calls, 'order', 'created_at', { ascending: false })).toBe(true);
    expect(has(sch.calls, 'limit', 1)).toBe(true);
  });

  it('does not query installments or scholarships at all without an application', async () => {
    const { db, queries } = recordingDb((table, calls) => {
      if (table === 'users') return { data: { id: 'u2', phone_verified: false } };
      const single = calls.some(([m]) => m === 'maybeSingle' || m === 'single');
      return { data: single ? null : [] };
    });

    const detail = await getUserJourneyDetail('u2', db);
    expect(detail?.leadProfile).toBeNull();
    expect(detail?.installments).toEqual([]);
    expect(detail?.scholarshipApplication).toBeNull();
    expect(detail?.pipelineStage).toBe('new_lead');
    expect(queries.some((q) => q.table === 'payment_installments')).toBe(false);
    expect(queries.some((q) => q.table === 'scholarship_applications')).toBe(false);
  });

  it('returns null for an unknown user', async () => {
    const { db } = recordingDb((table) =>
      table === 'users' ? { data: null, error: { code: 'PGRST116', message: 'no rows' } } : { data: null },
    );
    expect(await getUserJourneyDetail('missing', db)).toBeNull();
  });

  it('reads only the joined columns the screens use', async () => {
    const { db, queries } = recordingDb((table, calls) => {
      if (table === 'users') return { data: { id: 'u3' } };
      const single = calls.some(([m]) => m === 'maybeSingle' || m === 'single');
      return { data: single ? null : [] };
    });
    await getUserJourneyDetail('u3', db);
    const selects = queries.flatMap((q) =>
      q.calls.filter(([m]) => m === 'select').map(([, a]) => ({ table: q.table, cols: String(a[0]) })),
    );
    // No nested table is fetched whole any more.
    for (const { cols } of selects) expect(cols).not.toMatch(/\(\*\)/);
    // Only the rows that feed edit dialogs (or keep '*' on purpose) read every column.
    const wholeRow = new Set(['users', 'lead_profiles', 'student_profiles', 'demo_class_registrations', 'onboarding_responses']);
    for (const { table, cols } of selects) {
      if (!wholeRow.has(table)) expect(cols.trim().startsWith('*'), `${table} reads every column`).toBe(false);
    }
    expect(selects.length).toBeGreaterThanOrEqual(16);
  });
});

describe('getRevenueByYear', () => {
  it('maps revenue_by_year rows and sorts the unstamped bucket first, then newest year', async () => {
    const rows = [
      { year: '2025-26', student_count: '10', total_fee: '100000', collected: 60000, pending: 40000, fully_paid_count: 3, partial_count: '4' },
      { year: null, student_count: 2, total_fee: 0, collected: 0, pending: 0, fully_paid_count: 0, partial_count: 0 },
      { year: '2026-27', student_count: 5, total_fee: 50000, collected: 10000, pending: 40000, fully_paid_count: 1, partial_count: 1 },
    ];
    expect(mapRevenueByYearRows(rows).map((r) => r.year)).toEqual([null, '2026-27', '2025-26']);
    expect(mapRevenueByYearRows(rows)[2]).toEqual({
      year: '2025-26',
      studentCount: 10,
      totalFee: 100000,
      collected: 60000,
      pending: 40000,
      fullyPaidCount: 3,
      partialCount: 4,
    });
  });

  it('calls the RPC with the program and skips the table read', async () => {
    const calls: unknown[] = [];
    const client = {
      rpc: async (fn: string, args: unknown) => {
        calls.push([fn, args]);
        return { data: [], error: null };
      },
      from: () => {
        throw new Error('table read');
      },
    } as any;
    expect(await getRevenueByYear({ program: 'software' }, client)).toEqual([]);
    expect(calls).toEqual([['revenue_by_year', { p_program: 'software' }]]);
  });
});
