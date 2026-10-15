// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readAdsEnv } from './config';
import { loadManualSpend, loadRoiPeople, loadSpend, saveManualSpend, SPEND_KEY } from './roi-store';
import { createFakeDb } from './test-utils/fake-db';

const FROM = '2026-01-01T00:00:00+05:30';
const user = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: id.toUpperCase(),
  email: `${id}@mail.com`,
  phone: null,
  phone_verified: true,
  user_type: 'lead',
  first_touch: null,
  first_touch_at: null,
  created_at: '2026-10-10T06:00:00Z',
  ...over,
});
const AD = { gclid: 'abc' };

function seed() {
  return createFakeDb({
    users: [
      user('ad1', { phone: '+919000000001', first_touch: AD, first_touch_at: '2026-10-09T06:00:00Z' }),
      // The same person again, made later by staff with only the phone.
      user('twin', { phone: '9000000001', first_touch: null, created_at: '2026-10-20T06:00:00Z' }),
      user('said', { phone: '+919000000002' }),
      user('plain', { phone: '+919000000003' }),
      user('both', { phone: '+919000000004', first_touch: AD, first_touch_at: '2026-10-11T06:00:00Z' }),
      user('staff', { phone: '+919000000005', first_touch: AD, user_type: 'admin' }),
      user('unverified', { phone: '+919000000006', first_touch: AD, phone_verified: false }),
    ],
    onboarding_questions: [{ id: 'q1', question_key: 'referral_source' }],
    onboarding_responses: [
      { id: 'r1', user_id: 'said', question_id: 'q1', response: { value: 'google_ad' } },
      { id: 'r2', user_id: 'plain', question_id: 'q1', response: { value: 'google' } },
      { id: 'r3', user_id: 'both', question_id: 'q1', response: { value: 'google_ad' } },
    ],
    demo_class_registrations: [
      { id: 'd1', user_id: null, phone: '9000000001', status: 'approved', attended: true },
      { id: 'd2', user_id: 'said', phone: '9000000002', status: 'cancelled', attended: false },
    ],
    student_profiles: [{ id: 'sp1', user_id: 'twin' }],
    payments: [
      // Linked both ways: must count once.
      { id: 'p1', amount: 20000, status: 'paid', user_id: 'twin', student_profile_id: 'sp1' },
      { id: 'p2', amount: 5000, status: 'paid', user_id: null, student_profile_id: 'sp1' },
      { id: 'p3', amount: 9999, status: 'pending', user_id: 'twin', student_profile_id: 'sp1' },
    ],
  });
}

describe('loadRoiPeople', () => {
  it('finds confirmed and said-google-ad people, follows the phone to a second account, and counts fees once', async () => {
    const { people, alsoSaidGoogle } = await loadRoiPeople(seed(), FROM);
    const byId = Object.fromEntries(people.map((p) => [p.userId, p]));

    expect(Object.keys(byId).sort()).toEqual(['ad1', 'both', 'said']);
    expect(byId.ad1).toMatchObject({ tier: 'confirmed', cohortMonth: '2026-10', demoBooked: true, demoAttended: true, joined: true, feesPaid: 25000 });
    expect(byId.both.tier).toBe('confirmed');
    expect(byId.said).toMatchObject({ tier: 'said_google_ad', demoBooked: false, joined: false, feesPaid: 0 });
    expect(alsoSaidGoogle).toEqual({ '2026-10': 1 });
  });

  it('credits a shared phone once, to the confirmed account', async () => {
    const db = seed();
    db.tables.onboarding_responses.push({ id: 'r4', user_id: 'twin', question_id: 'q1', response: { value: 'google_ad' } });
    const { people } = await loadRoiPeople(db, FROM);
    expect(people.filter((p) => p.phone10 === '9000000001').map((p) => p.userId)).toEqual(['ad1']);
  });

  it('ignores demos, enrolments and fees from before the ad click, such as an older sibling on the same phone', async () => {
    const db = createFakeDb({
      users: [
        user('ad', { phone: '+919000000009', first_touch: AD, first_touch_at: '2026-10-09T06:00:00Z' }),
        user('sibling', { phone: '9000000009', created_at: '2025-04-01T06:00:00Z' }),
      ],
      demo_class_registrations: [{ id: 'd9', user_id: 'sibling', phone: '9000000009', status: 'approved', attended: true, created_at: '2025-04-02T06:00:00Z' }],
      student_profiles: [{ id: 'sp9', user_id: 'sibling', created_at: '2025-05-01T06:00:00Z' }],
      payments: [
        { id: 'p9', amount: 40000, status: 'paid', user_id: 'sibling', student_profile_id: 'sp9', paid_at: '2025-05-01T06:00:00Z', created_at: '2025-05-01T06:00:00Z' },
        { id: 'p10', amount: 3000, status: 'paid', user_id: 'ad', student_profile_id: null, paid_at: null, created_at: '2026-10-12T06:00:00Z' },
      ],
    });
    const [p] = (await loadRoiPeople(db, FROM)).people;
    expect(p).toMatchObject({ userId: 'ad', demoBooked: false, demoAttended: false, joined: false, feesPaid: 3000 });
  });

  it('returns nobody when no one came from ads', async () => {
    const { people } = await loadRoiPeople(createFakeDb({ users: [user('x')] }), FROM);
    expect(people).toEqual([]);
  });
});

describe('spend', () => {
  it('saves typed spend under its own settings key, clears it with null, and audits each change', async () => {
    const db = createFakeDb({ marketing_ai_settings: [{ key: 'targets', value: { x: 1 } }] });
    expect(await saveManualSpend(db, '2026-10', 6480, 'admin-1')).toEqual({ '2026-10': 6480 });
    expect(await loadManualSpend(db)).toEqual({ '2026-10': 6480 });
    expect(await saveManualSpend(db, '2026-10', null, 'admin-1')).toEqual({});
    expect(db.tables.marketing_ai_settings.find((r) => r.key === 'targets')!.value).toEqual({ x: 1 });
    expect(db.tables.marketing_ai_settings.find((r) => r.key === SPEND_KEY)!.updated_by).toBe('admin-1');
    expect(db.tables.marketing_ai_audit_log.map((a) => [a.event, a.entity_id, a.after])).toEqual([
      ['spend_manual_set', '2026-10', { amount: 6480 }],
      ['spend_manual_set', '2026-10', { amount: null }],
    ]);
  });

  it('lets live Google spend replace typed spend, but never the sample account', async () => {
    const day = (id: number, level: string, date: string, cost: number) => ({ id, customer_id: '4444444444', level, date, cost_micros: cost, impressions: 0, clicks: 0, conversions: 0, conversions_value: 0, budget_micros: null });
    const db = createFakeDb({
      marketing_ai_settings: [{ key: SPEND_KEY, value: { '2026-09': 3000, '2026-10': 6000 } }],
      ads_entity_daily: [day(1, 'campaign', '2026-10-02', 2_000_000_000), day(2, 'campaign', '2026-10-03', 500_400_000), day(3, 'keyword', '2026-10-03', 999_000_000)],
    });
    const live = readAdsEnv({ GOOGLE_ADS_MODE: 'live', GOOGLE_ADS_CUSTOMER_ID: '4444444444' });
    expect(await loadSpend(db, '2026-01', '2026-10-15', live)).toEqual({
      '2026-09': { amount: 3000, source: 'manual' },
      '2026-10': { amount: 2500, source: 'google' },
    });
    const sample = readAdsEnv({});
    expect((await loadSpend(db, '2026-01', '2026-10-15', sample))['2026-10']).toEqual({ amount: 6000, source: 'manual' });
  });
});
