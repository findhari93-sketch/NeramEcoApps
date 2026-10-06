// @vitest-environment node
import { createHash } from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import { readAdsEnv } from '../config';
import { countSignups, isGoogleAdsTouch } from '../funnel';
import { createFakeDb } from '../test-utils/fake-db';
import type { AdsClient } from './client';
import {
  failedIndexes,
  isRealProspect,
  normalizeEmail,
  normalizePhoneE164,
  selectConversions,
  sha256Hex,
  toAdsDateTime,
  toClickConversion,
  uploadConversions,
  type ConversionEvent,
  type UserForConversion,
} from './conversions';

const NOW = new Date('2026-10-30T12:00:00Z');
const user = (over: Partial<UserForConversion> = {}): UserForConversion => ({
  id: 'U1',
  email: 'Asha.R@Gmail.com',
  phone: '+919876543210',
  phone_verified: true,
  user_type: 'lead',
  first_touch: { gclid: 'G1', utm_source: 'google' },
  first_touch_at: '2026-10-20T09:00:00Z',
  created_at: '2026-10-20T09:00:00Z',
  ...over,
});
const otp = (userId = 'U1', at = '2026-10-21T10:00:00Z'): ConversionEvent => ({ user_id: userId, type: 'phone_verified', at, value_inr: null, order_id: `otp-${userId}` });

describe('normalising and hashing', () => {
  it('uses real SHA-256', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('brings every stored phone format to E.164', () => {
    expect(normalizePhoneE164('+919876543210')).toBe('+919876543210');
    expect(normalizePhoneE164('9876543210')).toBe('+919876543210');
    expect(normalizePhoneE164('919876543210')).toBe('+919876543210');
    expect(normalizePhoneE164('09876543210')).toBe('+919876543210');
    expect(normalizePhoneE164('+971 50 123 4567')).toBe('+971501234567');
    expect(normalizePhoneE164('12345')).toBeNull();
    expect(normalizePhoneE164(null)).toBeNull();
  });

  it("follows Google's email rules, dots removed only for gmail", () => {
    expect(normalizeEmail('  Asha.R@Gmail.com ')).toBe('ashar@gmail.com');
    expect(normalizeEmail('asha.r@neramclasses.com')).toBe('asha.r@neramclasses.com');
    expect(normalizeEmail('not-an-email')).toBeNull();
  });

  it('never uploads staff or synthetic test accounts', () => {
    expect(isRealProspect(user({ user_type: 'teacher' }))).toBe(false);
    expect(isRealProspect(user({ email: 'e2e-otp@neramclasses.com' }))).toBe(false);
    expect(isRealProspect(user({ email: 'e2etestingstudent@neramclasses.com' }))).toBe(false);
    expect(isRealProspect(user())).toBe(true);
  });
});

describe('selectConversions', () => {
  it('sends the click id with the hashed phone and email', () => {
    const [c] = selectConversions([user()], [otp()], new Set(), NOW);
    expect(c).toMatchObject({
      conversion_type: 'phone_verified',
      click_id_type: 'gclid',
      click_id: 'G1',
      matched_by: ['click_id', 'phone', 'email'],
      hashed_phone: createHash('sha256').update('+919876543210').digest('hex'),
      hashed_email: createHash('sha256').update('ashar@gmail.com').digest('hex'),
      conversion_time: '2026-10-21T10:00:00Z',
    });
  });

  it('still uploads with only hashed identifiers when the click id was lost (enhanced conversions for leads)', () => {
    const [c] = selectConversions([user({ first_touch: null })], [otp()], new Set(), NOW);
    expect(c).toMatchObject({ click_id_type: 'none', click_id: null, matched_by: ['phone', 'email'] });
  });

  it('prefers gclid, then wbraid, then gbraid, and drops a click older than 90 days', () => {
    expect(selectConversions([user({ first_touch: { gbraid: 'B', wbraid: 'W' } })], [otp()], new Set(), NOW)[0].click_id).toBe('W');
    expect(selectConversions([user({ first_touch: { gbraid: 'B' } })], [otp()], new Set(), NOW)[0].click_id_type).toBe('gbraid');
    const old = selectConversions([user({ first_touch_at: '2026-06-01T00:00:00Z' })], [otp()], new Set(), NOW)[0];
    expect(old.click_id_type).toBe('none');
  });

  it('keeps the earliest event per user, and skips done, staff and events over 90 days old', () => {
    const out = selectConversions([user()], [otp('U1', '2026-10-25T00:00:00Z'), otp('U1', '2026-10-21T00:00:00Z')], new Set(), NOW);
    expect(out).toHaveLength(1);
    expect(out[0].conversion_time).toBe('2026-10-21T00:00:00Z');
    expect(selectConversions([user()], [otp()], new Set(['U1:phone_verified']), NOW)).toHaveLength(0);
    expect(selectConversions([user({ user_type: 'admin' })], [otp()], new Set(), NOW)).toHaveLength(0);
    expect(selectConversions([user()], [otp('U1', '2026-06-01T00:00:00Z')], new Set(), NOW)).toHaveLength(0);
  });

  it('skips a user with nothing to match on', () => {
    expect(selectConversions([user({ first_touch: null, phone: null, email: null })], [otp()], new Set(), NOW)).toHaveLength(0);
  });
});

describe('formatting', () => {
  it('writes IST date-times the way Google wants them', () => {
    expect(toAdsDateTime('2026-10-05T10:00:00Z')).toBe('2026-10-05 15:30:00+05:30');
  });

  it('builds the click conversion with user identifiers, and skips an unconfigured action', () => {
    const env = readAdsEnv({ GOOGLE_ADS_CUSTOMER_ID: '9', GOOGLE_ADS_CONV_ACTION_PHONE: '77' });
    const [c] = selectConversions([user()], [otp()], new Set(), NOW);
    expect(toClickConversion(c, env)).toEqual({
      gclid: 'G1',
      userIdentifiers: [{ hashedPhoneNumber: c.hashed_phone }, { hashedEmail: c.hashed_email }],
      conversionAction: 'customers/9/conversionActions/77',
      conversionDateTime: '2026-10-21 15:30:00+05:30',
      orderId: 'otp-U1',
    });
    expect(toClickConversion({ ...c, conversion_type: 'demo_booked' }, env)).toBeNull();
  });

  it('reads failed indexes from a partial failure', () => {
    const pfe = { details: [{ errors: [{ message: 'click too old', location: { fieldPathElements: [{ fieldName: 'conversions', index: 1 }] } }] }] };
    expect(failedIndexes(pfe)).toEqual(new Map([[1, 'click too old']]));
  });
});

describe('uploadConversions', () => {
  const env = (allow: boolean) => ({ ...readAdsEnv({ GOOGLE_ADS_MODE: 'live', GOOGLE_ADS_CUSTOMER_ID: '9', GOOGLE_ADS_CONV_ACTION_PHONE: '1', GOOGLE_ADS_CONV_ACTION_PAID: '2' }), allowMutations: allow });
  const seed = () =>
    createFakeDb({
      users: [user(), user({ id: 'U2', email: 'b@example.com', phone: '9123456789', first_touch: null, created_at: '2026-10-25T00:00:00Z' }), user({ id: 'T1', user_type: 'teacher' })],
      user_funnel_events: [
        { user_id: 'U1', event: 'otp_verified', created_at: '2026-10-21T10:00:00Z' },
        { user_id: 'T1', event: 'otp_verified', created_at: '2026-10-22T10:00:00Z' },
      ],
      demo_class_registrations: [],
      payments: [{ id: 'P1', user_id: 'U1', amount: 25000, status: 'paid', verified_at: '2026-10-28T00:00:00Z', created_at: '2026-10-27T00:00:00Z' }],
    });

  it('validates only without live changes, and records it so the real upload happens later', async () => {
    const db = seed();
    const upload = vi.fn(async (list: unknown[]) => ({ results: list.map(() => ({})), partialFailureError: null }));
    const ads = { mode: 'live', customerId: '9', uploadClickConversions: upload } as unknown as AdsClient;
    const stats = await uploadConversions(db, ads, env(false), 'run', NOW);
    expect(upload).toHaveBeenCalledWith(expect.any(Array), { validateOnly: true });
    // U1 (OTP) and U2 (phone-first sign-up) verified; the teacher is skipped. U1 also paid.
    expect(stats).toMatchObject({ candidates: 3, validated: 3, uploaded: 0, validate_only: true, by_type: { phone_verified: 2, admission_paid: 1 }, with_click_id: 2 });
    expect(db.tables.ads_conversion_uploads.find((r) => r.user_id === 'U2')).toMatchObject({ status: 'validated', click_id_type: 'none', matched_by: ['phone', 'email'] });
  });

  it('uploads for real, marks partial failures, and does not upload anyone twice', async () => {
    const db = seed();
    const upload = vi.fn(async (list: unknown[]) => ({
      results: list.map(() => ({})),
      partialFailureError: { details: [{ errors: [{ message: 'not matched', location: { fieldPathElements: [{ fieldName: 'conversions', index: 0 }] } }] }] },
    }));
    const ads = { mode: 'live', customerId: '9', uploadClickConversions: upload } as unknown as AdsClient;
    expect(await uploadConversions(db, ads, env(true), 'run', NOW)).toMatchObject({ uploaded: 2, failed: 1 });
    await uploadConversions(db, ads, env(true), 'run2', NOW);
    expect((upload.mock.calls[1] as any)[0]).toHaveLength(1); // only the failed one is retried
  });
});

describe('our own sign-up count', () => {
  it('recognises a Google Ads touch by click id or paid Google utm', () => {
    expect(isGoogleAdsTouch({ gbraid: 'x' })).toBe(true);
    expect(isGoogleAdsTouch({ utm_source: 'google', utm_medium: 'cpc' })).toBe(true);
    expect(isGoogleAdsTouch({ utm_source: 'google', utm_medium: 'organic' })).toBe(false);
    expect(isGoogleAdsTouch(null)).toBe(false);
  });

  it('counts verified, real sign-ups and those from ads', async () => {
    const db = createFakeDb({
      users: [user(), user({ id: 'U2', first_touch: null, created_at: '2026-10-25T00:00:00Z' }), user({ id: 'T1', user_type: 'teacher' })],
      user_funnel_events: [{ user_id: 'U1', event: 'otp_verified', created_at: '2026-10-21T10:00:00Z' }],
    });
    expect(await countSignups(db, '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z')).toEqual({ verified: 2, from_google_ads: 1 });
  });
});
