// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

let dbUser: any = null;
const claimFunnelStage = vi.fn(async (..._args: unknown[]) => true);
const recordFirstTouch = vi.fn(async (..._args: unknown[]) => true);
const resolveDuplicatesFor = vi.fn(async (id: string, ..._rest: unknown[]) => ({ survivorId: id }));
const getOrCreateUserFromFirebase = vi.fn(async () => ({ user: { ...baseUser, created_at: new Date().toISOString() }, isNewUser: true }));

const baseUser = { id: 'user-1', name: 'Arun', email: 'arun@example.com', phone: null, phone_verified: false, user_type: 'lead' };

vi.mock('@neram/database', () => ({
  getUserByFirebaseUid: async () => dbUser,
  updateUser: async (id: string, patch: any) => ({ ...(dbUser ?? baseUser), id, ...patch }),
  getOrCreateUserFromFirebase: (...a: unknown[]) => getOrCreateUserFromFirebase(...(a as [])),
  checkPhoneExists: async () => null,
  findVerifiedPhoneOwner: async () => null,
  getSupabaseAdminClient: () => ({}),
  insertFunnelEvent: vi.fn(async () => null),
  recordDuplicateCandidate: vi.fn(async () => undefined),
  resolveDuplicatesFor: (...a: unknown[]) => resolveDuplicatesFor(...(a as [string])),
  normalisePhoneE164: (p: string) => p,
  getUserById: async (id: string) => ({ ...baseUser, id, name: 'Kavya', phone: '+919876543210', phone_verified: true }),
  linkPhoneAttempts: vi.fn(async () => undefined),
  normalizeAttemptPhone: (p: string) => p,
  recordPhoneAttempt: vi.fn(async () => undefined),
  recordFirstTouch: (...a: unknown[]) => recordFirstTouch(...a),
  queueFirstTouchWhatsApp: vi.fn(async () => undefined),
  claimFunnelStage: (...a: unknown[]) => claimFunnelStage(...a),
}));
vi.mock('@neram/database/signup-geo', () => ({
  clientIpFromHeaders: () => null,
  signupGeoFromHeaders: () => ({}),
}));
vi.mock('@neram/database/signup-alert', () => ({
  alertNewSignup: vi.fn(async () => ({ sent: false })),
  recordSignupGeo: vi.fn(async () => undefined),
}));
vi.mock('@/lib/firebase-admin', () => ({
  verifyIdToken: async () => ({ uid: 'fb-1', phone_number: '+919876543210' }),
}));
vi.mock('@/lib/phone-match', () => ({ isSamePhone: () => true }));
vi.mock('@/lib/cors', () => ({ getCorsHeaders: () => ({}) }));

import { POST } from './route';

const ANON = `anon_${'a'.repeat(32)}`;

function call(extra: Record<string, unknown> = {}) {
  return POST(
    new NextRequest('http://localhost/api/auth/verify-phone', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken: 't', phoneNumber: '+919876543210', ...extra }),
    }),
  );
}

describe('POST /api/auth/verify-phone: Google Ads sign-up stage', () => {
  beforeEach(() => {
    claimFunnelStage.mockClear();
    recordFirstTouch.mockClear();
    getOrCreateUserFromFirebase.mockClear();
    dbUser = { ...baseUser, created_at: '2025-01-01T00:00:00Z', first_touch_at: '2025-01-01T00:00:00Z', anonymous_id: ANON };
  });

  it('says signupConversion only when the sign-up stage was claimed just now', async () => {
    claimFunnelStage.mockResolvedValueOnce(true);
    const first = await (await call()).json();
    expect(first.signupConversion).toBe(true);
    expect(first.user.phone).toBe('+919876543210');
    expect(claimFunnelStage).toHaveBeenCalledWith({}, 'user-1', 'signup_verified', { metadata: { value_inr: 100 }, sourceApp: 'app' });

    claimFunnelStage.mockResolvedValueOnce(false);
    const returning = await (await call()).json();
    expect(returning.signupConversion).toBe(false);
  });

  it('a sign-up folded into a known family is not an Ads sign-up', async () => {
    resolveDuplicatesFor.mockResolvedValueOnce({ survivorId: 'student-9' });
    const json = await (await call()).json();
    expect(json).toMatchObject({ success: true, signupConversion: false, mergedInto: 'student-9' });
    expect(json.user.id).toBe('student-9');
    expect(claimFunnelStage).not.toHaveBeenCalled();
  });

  it('never counts a non-lead account (staff-made student, teacher)', async () => {
    dbUser = { ...dbUser, user_type: 'student' };
    const json = await (await call()).json();
    expect(json.signupConversion).toBe(false);
    expect(claimFunnelStage).not.toHaveBeenCalled();
  });

  it('keeps the origin the body carries when it creates the account (cross-origin, no cookies)', async () => {
    dbUser = null;
    await call({
      anonymousId: ANON,
      first_touch: { gclid: 'TEST_GCLID_123', utm_source: 'google', matchtype: 'e' },
    });
    expect(recordFirstTouch).toHaveBeenCalledWith(
      {},
      'user-1',
      expect.objectContaining({
        anonymousId: ANON,
        firstTouch: expect.objectContaining({ gclid: 'TEST_GCLID_123', utm_source: 'google', matchtype: 'e' }),
      }),
    );
  });

  it('fills a missing first touch on an account made in the last day', async () => {
    dbUser = { ...baseUser, created_at: new Date().toISOString(), first_touch_at: null, anonymous_id: ANON };
    await call({ first_touch: { gclid: 'G2' } });
    expect(recordFirstTouch).toHaveBeenCalledWith({}, 'user-1', expect.objectContaining({ firstTouch: expect.objectContaining({ gclid: 'G2' }) }));
  });

  it('never rewrites the origin of an older account', async () => {
    dbUser = { ...baseUser, created_at: '2025-01-01T00:00:00Z', first_touch_at: null, anonymous_id: null };
    await call({ first_touch: { gclid: 'LATER' } });
    expect(recordFirstTouch).not.toHaveBeenCalled();
  });
});
