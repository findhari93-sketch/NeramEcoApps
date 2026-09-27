// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase } from './fake-supabase';

const fake = { current: createFakeSupabase() };
vi.mock('../../client', async () => {
  const actual = await vi.importActual<any>('../../client');
  return { ...actual, getSupabaseAdminClient: () => fake.current.client };
});

import { logToolUsage } from '../tools';

describe('logToolUsage', () => {
  beforeEach(() => {
    fake.current = createFakeSupabase({
      users: [{ id: '11111111-1111-4111-8111-111111111111', firebase_uid: 'fb-google' }],
      user_identities: [{ id: 'i1', user_id: '11111111-1111-4111-8111-111111111111', provider: 'firebase', provider_uid: 'fb-phone' }],
    });
  });

  it('resolves a Firebase uid to the users.id and writes with the service role, ignoring the client passed in', async () => {
    const browserClient = { from: vi.fn(() => { throw new Error('the anon client must not be used'); }) } as any;
    await logToolUsage({ toolName: 'college_predictor', userId: 'fb-phone', inputData: { nataScore: 120 } }, browserClient);
    const { tables } = fake.current;
    expect(tables.tool_usage_logs).toHaveLength(1);
    expect(tables.tool_usage_logs[0]).toMatchObject({
      user_id: '11111111-1111-4111-8111-111111111111',
      tool_name: 'college_predictor',
    });
    expect(browserClient.from).not.toHaveBeenCalled();
  });

  it('also records a tool_completed event in the one event stream', async () => {
    await logToolUsage({ toolName: 'rank_predictor', userId: 'fb-google', inputData: {}, executionTimeMs: 42 });
    expect(fake.current.tables.user_funnel_events).toEqual([
      expect.objectContaining({
        funnel: 'tool',
        event: 'tool_completed',
        status: 'completed',
        user_id: '11111111-1111-4111-8111-111111111111',
        metadata: { tool: 'rank_predictor', execution_time_ms: 42 },
      }),
    ]);
  });

  it('keeps a uuid as it is and logs an unknown uid anonymously rather than failing', async () => {
    await logToolUsage({ toolName: 't', userId: '22222222-2222-4222-8222-222222222222', inputData: {} });
    await logToolUsage({ toolName: 't', userId: 'fb-unknown', inputData: {} });
    expect(fake.current.tables.tool_usage_logs.map((r) => r.user_id)).toEqual([
      '22222222-2222-4222-8222-222222222222',
      null,
    ]);
  });
});
