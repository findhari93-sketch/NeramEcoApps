import { describe, expect, it } from 'vitest';
import { claimDraftsForDemoNudge, draftNudgeGreeting } from '../apply-draft-nudge';
import { createFakeSupabase } from './fake-supabase';

const NOW = new Date('2026-10-08T08:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

function seed() {
  return createFakeSupabase({
    users: [
      { id: 'u-ok', phone: '+919876543210', phone_verified: true, first_name: 'Priya Devi', name: 'Priya Devi' },
      { id: 'u-unverified', phone: '+919800000001', phone_verified: false, first_name: 'Ravi', name: null },
      { id: 'u-demo', phone: '+919800000002', phone_verified: true, first_name: 'Asha', name: null },
      { id: 'u-submitted', phone: '+919800000003', phone_verified: true, first_name: 'Kiran', name: null },
      { id: 'u-old', phone: '+919800000004', phone_verified: true, first_name: 'Meena', name: null },
      { id: 'u-fresh', phone: '+919800000005', phone_verified: true, first_name: 'Arun', name: null },
      { id: 'u-nudged', phone: '+919800000006', phone_verified: true, first_name: 'Divya', name: null },
      { id: 'u-noname', phone: '+919800000007', phone_verified: true, first_name: null, name: null },
    ],
    lead_profiles: [
      { id: 'lp-ok', user_id: 'u-ok', status: 'draft', updated_at: hoursAgo(30), demo_nudge_sent_at: null },
      { id: 'lp-unverified', user_id: 'u-unverified', status: 'draft', updated_at: hoursAgo(30), demo_nudge_sent_at: null },
      { id: 'lp-demo', user_id: 'u-demo', status: 'draft', updated_at: hoursAgo(30), demo_nudge_sent_at: null },
      { id: 'lp-sub-draft', user_id: 'u-submitted', status: 'draft', updated_at: hoursAgo(30), demo_nudge_sent_at: null },
      { id: 'lp-sub', user_id: 'u-submitted', status: 'submitted', updated_at: hoursAgo(30), demo_nudge_sent_at: null },
      { id: 'lp-old', user_id: 'u-old', status: 'draft', updated_at: hoursAgo(100), demo_nudge_sent_at: null },
      { id: 'lp-fresh', user_id: 'u-fresh', status: 'draft', updated_at: hoursAgo(3), demo_nudge_sent_at: null },
      { id: 'lp-nudged', user_id: 'u-nudged', status: 'draft', updated_at: hoursAgo(30), demo_nudge_sent_at: hoursAgo(5) },
      { id: 'lp-noname', user_id: 'u-noname', status: 'draft', updated_at: hoursAgo(48), demo_nudge_sent_at: null },
    ],
    demo_class_registrations: [{ id: 'd1', user_id: 'u-demo', status: 'cancelled' }],
  });
}

describe('claimDraftsForDemoNudge', () => {
  it('picks only 24 to 72 hour old, never-nudged drafts of verified students with no demo and no later application', async () => {
    const { client, tables } = seed();
    const picked = await claimDraftsForDemoNudge({ now: NOW }, client);

    expect(picked.map((p) => p.leadProfileId).sort()).toEqual(['lp-noname', 'lp-ok']);
    expect(picked.find((p) => p.leadProfileId === 'lp-ok')).toMatchObject({ userId: 'u-ok', phone: '919876543210', name: 'Priya' });
    expect(picked.find((p) => p.leadProfileId === 'lp-noname')?.name).toBe('there');

    const claimed = tables.lead_profiles.filter((r) => r.demo_nudge_sent_at === NOW.toISOString()).map((r) => r.id);
    expect(claimed.sort()).toEqual(['lp-noname', 'lp-ok']);
  });

  it('never claims the same draft twice', async () => {
    const { client } = seed();
    await claimDraftsForDemoNudge({ now: NOW }, client);
    const again = await claimDraftsForDemoNudge({ now: new Date(NOW.getTime() + 5 * 60_000) }, client);
    expect(again).toEqual([]);
  });

  it('respects the limit', async () => {
    const { client } = seed();
    const picked = await claimDraftsForDemoNudge({ now: NOW, limit: 1 }, client);
    expect(picked).toHaveLength(1);
  });
});

describe('draftNudgeGreeting', () => {
  it('uses the first word of the first name, then the name, then a friendly fallback', () => {
    expect(draftNudgeGreeting({ first_name: 'Priya Devi', name: null })).toBe('Priya');
    expect(draftNudgeGreeting({ first_name: null, name: 'Hari Heera' })).toBe('Hari');
    expect(draftNudgeGreeting({ first_name: '  ', name: null })).toBe('there');
  });
});
