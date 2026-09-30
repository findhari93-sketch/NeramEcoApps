// @vitest-environment node
/**
 * The People page counts: exact head counts per stage (no 1,000-row cap), the
 * exam-season and activity filters on the list, and the breakdown RPC.
 */
import { describe, it, expect } from 'vitest';
import { getPipelineStageCounts, getLeadPipelineStageCounts, listUserJourneys, getPeopleBreakdown } from './crm';

type Call = { method: string; args: unknown[] };

/** A chainable fake: records every call, resolves with `result(calls)`. */
function fakeClient(result: (calls: Call[]) => unknown) {
  const queries: Call[][] = [];
  const rpcCalls: Call[] = [];
  const makeQuery = (first: Call) => {
    const calls: Call[] = [first];
    queries.push(calls);
    const q: any = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(result(calls));
          }
          return (...args: unknown[]) => {
            calls.push({ method: prop, args });
            return q;
          };
        },
      }
    );
    return q;
  };
  const client: any = {
    from: (table: string) => makeQuery({ method: 'from', args: [table] }),
    rpc: (name: string, params: unknown) => {
      rpcCalls.push({ method: name, args: [params] });
      return Promise.resolve(result([{ method: 'rpc', args: [name, params] }]));
    },
  };
  return { client, queries, rpcCalls };
}

const stageOf = (calls: Call[]) => calls.find((c) => c.method === 'eq' && c.args[0] === 'pipeline_stage')?.args[1];

describe('getPipelineStageCounts', () => {
  it('uses one exact head count per stage, so totals can pass 1,000', async () => {
    const counts: Record<string, number> = { new_lead: 900, phone_verified: 700, enrolled: 40 };
    const { client, queries } = fakeClient((calls) => ({ count: counts[stageOf(calls) as string] ?? 0, error: null }));

    const result = await getPipelineStageCounts({ excludeArchived: true }, client);

    expect(queries).toHaveLength(8);
    for (const calls of queries) {
      const select = calls.find((c) => c.method === 'select');
      expect(select?.args[1]).toEqual({ count: 'exact', head: true });
      expect(calls).toContainEqual({ method: 'eq', args: ['lifecycle_status', 'active'] });
    }
    expect(result.new_lead).toBe(900);
    expect(result.total).toBe(1640);
  });

  it('throws when a count fails instead of showing zero', async () => {
    const { client } = fakeClient(() => ({ count: null, error: new Error('boom') }));
    await expect(getPipelineStageCounts({}, client)).rejects.toThrow('boom');
  });
});

describe('getLeadPipelineStageCounts', () => {
  it('skips the excluded stages and linked students', async () => {
    const { client, queries } = fakeClient(() => ({ count: 10, error: null }));
    const result = await getLeadPipelineStageCounts(['enrolled', 'payment_complete'], client);
    expect(queries).toHaveLength(6);
    expect(queries.map(stageOf)).not.toContain('enrolled');
    for (const calls of queries) {
      expect(calls).toContainEqual({ method: 'is', args: ['linked_classroom_email', null] });
    }
    expect(result.total).toBe(60);
    expect(result.enrolled).toBe(0);
  });
});

describe('listUserJourneys: season and activity', () => {
  it('filters by exam year bounds and an activity group', async () => {
    const { client, queries } = fakeClient(() => ({ data: [], error: null, count: 0 }));
    await listUserJourneys(
      { examYearMin: 2027, examYearMax: 2027, activityGroup: 'recent', identity: 'all' },
      client
    );
    const calls = queries[0];
    expect(calls[0]).toEqual({ method: 'from', args: ['user_lifecycle_view'] });
    expect(calls).toContainEqual({ method: 'gte', args: ['exam_year', 2027] });
    expect(calls).toContainEqual({ method: 'lte', args: ['exam_year', 2027] });
    expect(calls).toContainEqual({ method: 'in', args: ['engagement', ['new', 'engaged', 'low']] });
  });

  it('an exact engagement state wins over an activity group', async () => {
    const { client, queries } = fakeClient(() => ({ data: [], error: null, count: 0 }));
    await listUserJourneys({ engagement: 'inactive', activityGroup: 'recent' }, client);
    expect(queries[0]).toContainEqual({ method: 'eq', args: ['engagement', 'inactive'] });
    expect(queries[0].some((c) => c.method === 'in')).toBe(false);
  });

  it('"earlier" seasons only set an upper bound', async () => {
    const { client, queries } = fakeClient(() => ({ data: [], error: null, count: 0 }));
    await listUserJourneys({ examYearMax: 2026 }, client);
    expect(queries[0]).toContainEqual({ method: 'lte', args: ['exam_year', 2026] });
    expect(queries[0].some((c) => c.method === 'gte')).toBe(false);
  });
});

describe('getPeopleBreakdown', () => {
  it('calls the RPC with identity and outcome, and makes counts numbers', async () => {
    const { client, rpcCalls } = fakeClient(() => ({
      data: [{ lifecycle_status: 'active', exam_year: 2027, exam_year_source: 'signup', lifecycle_stage: 'lead', engagement: 'dormant', n: '12' }],
      error: null,
    }));
    const rows = await getPeopleBreakdown({ identity: 'microsoft', contactedStatus: 'dead_lead' }, client);
    expect(rpcCalls[0]).toEqual({ method: 'crm_people_breakdown', args: [{ p_identity: 'microsoft', p_contacted: 'dead_lead' }] });
    expect(rows[0].n).toBe(12);
  });

  it('defaults to everyone and no outcome', async () => {
    const { client, rpcCalls } = fakeClient(() => ({ data: [], error: null }));
    await getPeopleBreakdown({}, client);
    expect(rpcCalls[0].args[0]).toEqual({ p_identity: 'all', p_contacted: null });
  });
});
