// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fakeDb } from './testing/fake-db';
import { loadAssistantMonthUsage } from './usage';

describe('loadAssistantMonthUsage', () => {
  it('sums model answers and cost per student since the month start, across threads, past 1000 rows', async () => {
    const msgs = [
      ...Array.from({ length: 1200 }, (_, i) => ({ id: `a${i}`, thread_id: 't1', role: 'assistant', llm: true, cost_usd: 0.001, created_at: '2026-10-02T00:00:00Z' })),
      { id: 'b', thread_id: 't2', role: 'assistant', llm: true, cost_usd: 0.002, created_at: '2026-10-02T00:00:00Z' },
      { id: 'c', thread_id: 't3', role: 'assistant', llm: true, cost_usd: 0.004, created_at: '2026-10-02T00:00:00Z' },
      { id: 'd', thread_id: 't3', role: 'assistant', llm: false, cost_usd: null, created_at: '2026-10-02T00:00:00Z' },
      { id: 'e', thread_id: 't3', role: 'assistant', llm: true, cost_usd: 0.5, created_at: '2026-09-30T00:00:00Z' },
    ];
    const db = fakeDb({
      nexus_assistant_messages: msgs,
      nexus_assistant_threads: [{ id: 't1', user_id: 's1' }, { id: 't2', user_id: 's1' }, { id: 't3', user_id: 's2' }],
      users: [{ id: 's1', name: 'Priya' }, { id: 's2', name: 'Arun' }],
    });
    const out = await loadAssistantMonthUsage(db, '2026-10-01T00:00:00Z');
    expect(out).toEqual([
      { studentId: 's1', name: 'Priya', questions: 1201, costUsd: expect.closeTo(1.202, 5) },
      { studentId: 's2', name: 'Arun', questions: 1, costUsd: expect.closeTo(0.004, 5) },
    ]);
  });
});
