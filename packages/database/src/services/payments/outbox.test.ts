// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { backoffSeconds, processOutbox, enqueueOutbox, OutboxDeadLetter, OUTBOX_MAX_ATTEMPTS } from './outbox';

/**
 * The outbox is how a state change becomes exactly-once side effects. Pinned:
 * a job runs once and is marked done; a failing job is retried with a growing
 * delay and keeps its error; after the last try it is dead and someone is told;
 * a job nobody handles is dead at once.
 */
let claimed: any[] = [];
const updates: { id: string; patch: any }[] = [];
let upserts: any[] = [];

function fakeSupabase() {
  return {
    rpc: vi.fn(async (fn: string) => {
      if (fn === 'payments_claim_outbox') return { data: claimed, error: null };
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    }),
    from: (table: string) => {
      const api: any = {
        update: (patch: any) => {
          api._patch = patch;
          return api;
        },
        upsert: (row: any, opts: any) => {
          upserts.push({ table, row, opts });
          return { then: (r: any) => r({ data: null, error: null }) };
        },
        eq: (col: string, val: string) => {
          if (api._patch && col === 'id') updates.push({ id: val, patch: api._patch });
          return api;
        },
        then: (resolve: any) => resolve({ data: null, error: null }),
      };
      return api;
    },
  };
}

const job = (over: Partial<any> = {}) => ({
  id: 'job-1',
  aggregate_type: 'attempt',
  aggregate_id: 'att-1',
  job: 'fulfil_intent',
  payload: {},
  status: 'processing',
  attempts: 1,
  next_run_at: new Date().toISOString(),
  ...over,
});

beforeEach(() => {
  claimed = [];
  updates.length = 0;
  upserts = [];
});

describe('backoffSeconds', () => {
  it('grows 1m, 5m, 30m, 2h, 12h and then holds', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(backoffSeconds)).toEqual([60, 300, 1800, 7200, 43200, 43200, 43200]);
  });
});

describe('processOutbox', () => {
  it('runs the handler once and marks the job done', async () => {
    claimed = [job()];
    const handler = vi.fn(async (_job: any) => {});
    const result = await processOutbox(fakeSupabase(), { fulfil_intent: handler });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].aggregate_id).toBe('att-1');
    expect(updates).toHaveLength(1);
    expect(updates[0].patch.status).toBe('done');
    expect(updates[0].patch.done_at).toBeTruthy();
    expect(result).toEqual({ claimed: 1, done: 1, retried: 0, dead: 0 });
  });

  it('reschedules a failing job with the backoff and keeps the error', async () => {
    const before = Date.now();
    claimed = [job({ attempts: 2 })];
    const result = await processOutbox(fakeSupabase(), {
      fulfil_intent: async () => {
        throw new Error('bank is down');
      },
    });
    expect(result).toEqual({ claimed: 1, done: 0, retried: 1, dead: 0 });
    const patch = updates[0].patch;
    expect(patch.status).toBe('pending');
    expect(patch.locked_until).toBeNull();
    expect(patch.last_error).toContain('bank is down');
    const delay = (new Date(patch.next_run_at).getTime() - before) / 1000;
    expect(delay).toBeGreaterThanOrEqual(299);
    expect(delay).toBeLessThan(305);
  });

  it('declares a job dead after the last allowed try and tells someone', async () => {
    claimed = [job({ attempts: OUTBOX_MAX_ATTEMPTS })];
    const onDead = vi.fn(async (_job: any, _error: string) => {});
    const result = await processOutbox(
      fakeSupabase(),
      {
        fulfil_intent: async () => {
          throw new Error('still down');
        },
      },
      { onDead },
    );
    expect(result.dead).toBe(1);
    expect(updates[0].patch.status).toBe('dead');
    expect(onDead).toHaveBeenCalledTimes(1);
    expect(onDead.mock.calls[0][1]).toContain('still down');
  });

  it('kills a job that has no handler instead of retrying it forever', async () => {
    claimed = [job({ job: 'email_student:unknown' })];
    const onDead = vi.fn(async () => {});
    const result = await processOutbox(fakeSupabase(), {}, { onDead });
    expect(result.dead).toBe(1);
    expect(updates[0].patch.last_error).toMatch(/no handler/i);
    expect(onDead).toHaveBeenCalled();
  });

  it('matches a handler on the job family when the exact name is missing', async () => {
    claimed = [job({ job: 'email_student:verified' })];
    const family = vi.fn(async () => {});
    const result = await processOutbox(fakeSupabase(), { 'email_student:*': family });
    expect(family).toHaveBeenCalledTimes(1);
    expect(result.done).toBe(1);
  });

  it('lets a handler give a job up for good on its first try', async () => {
    claimed = [job({ attempts: 1 })];
    const onDead = vi.fn(async () => {});
    const result = await processOutbox(
      fakeSupabase(),
      {
        fulfil_intent: async () => {
          throw new OutboxDeadLetter('the student details were never saved');
        },
      },
      { onDead },
    );
    expect(result).toEqual({ claimed: 1, done: 0, retried: 0, dead: 1 });
    expect(updates[0].patch.status).toBe('dead');
    expect(onDead).toHaveBeenCalledTimes(1);
  });

  it('one bad job does not stop the others', async () => {
    claimed = [job({ id: 'a', job: 'fulfil_intent' }), job({ id: 'b', job: 'flag_duplicate' })];
    const flag = vi.fn(async () => {});
    const result = await processOutbox(fakeSupabase(), {
      fulfil_intent: async () => {
        throw new Error('x');
      },
      flag_duplicate: flag,
    });
    expect(flag).toHaveBeenCalled();
    expect(result).toEqual({ claimed: 2, done: 1, retried: 1, dead: 0 });
  });
});

describe('enqueueOutbox', () => {
  it('queues a job once per aggregate and job name', async () => {
    await enqueueOutbox(fakeSupabase(), { aggregateId: 'att-9', job: 'email_student:verified', payload: { to: 'x@y' } });
    expect(upserts).toHaveLength(1);
    expect(upserts[0].table).toBe('payment_outbox');
    expect(upserts[0].row).toMatchObject({ aggregate_type: 'attempt', aggregate_id: 'att-9', job: 'email_student:verified', payload: { to: 'x@y' } });
    expect(upserts[0].opts).toMatchObject({ onConflict: 'aggregate_id,job', ignoreDuplicates: true });
  });
});
