// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { getOnboardingAnalytics, mapOnboardingAnalyticsRpc } from '../onboarding';

describe('mapOnboardingAnalyticsRpc', () => {
  it('folds in_progress into pending and computes the completion rate over all sessions', () => {
    const out = mapOnboardingAnalyticsRpc({
      completed: 600,
      skipped: 300,
      pending: 200,
      in_progress: 50,
      total: 1150,
      distribution: { q1: { nata: '3', jee: 1 }, q2: { '4': 2 } },
    });
    expect(out).toEqual({
      total_completed: 600,
      total_skipped: 300,
      total_pending: 250,
      completion_rate: 600 / 1150,
      response_distribution: { q1: { nata: 3, jee: 1 }, q2: { '4': 2 } },
    });
  });

  it('returns zeros for an empty window', () => {
    expect(mapOnboardingAnalyticsRpc({ total: 0, distribution: {} })).toEqual({
      total_completed: 0,
      total_skipped: 0,
      total_pending: 0,
      completion_rate: 0,
      response_distribution: {},
    });
    expect(mapOnboardingAnalyticsRpc(null).completion_rate).toBe(0);
  });
});

describe('getOnboardingAnalytics', () => {
  it('asks the onboarding_analytics RPC with the date window and never reads the tables', async () => {
    const rpc = vi.fn(async () => ({ data: { completed: 1, total: 2, distribution: {} }, error: null }));
    const from = vi.fn(() => {
      throw new Error('table read');
    });
    const out = await getOnboardingAnalytics({ startDate: '2026-09-01', endDate: '2026-09-30' }, { rpc, from } as any);
    expect(rpc).toHaveBeenCalledWith('onboarding_analytics', { p_start: '2026-09-01', p_end: '2026-09-30' });
    expect(from).not.toHaveBeenCalled();
    expect(out.completion_rate).toBe(0.5);
  });

  it('passes null bounds when no window is given', async () => {
    const rpc = vi.fn(async () => ({ data: { total: 0 }, error: null }));
    await getOnboardingAnalytics({}, { rpc, from: vi.fn() } as any);
    expect(rpc).toHaveBeenCalledWith('onboarding_analytics', { p_start: null, p_end: null });
  });
});
