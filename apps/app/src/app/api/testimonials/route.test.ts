// @vitest-environment node
import { describe, test, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * /api/testimonials: auth, validation, the server-side age rule and the
 * 30-day rate limit. The validator is the real one from
 * packages/database learner-feedback.ts (pure), so the rules the form and the
 * route share are exercised, not mocked.
 */

let dbUser: Record<string, unknown> | null;
let lastLearnerRows: Array<{ created_at: string }>;

const verifyIdToken = vi.fn(async (token: string) => {
  if (token === 'bad') throw new Error('invalid token');
  return { uid: 'firebase-uid-1' };
});
const submitLearnerTestimonial = vi.fn(async (..._args: unknown[]) => ({ id: 'testimonial-1' }));
const insertFunnelEvent = vi.fn(async (..._args: unknown[]) => null);

vi.mock('@/lib/firebase-admin', () => ({
  verifyIdToken: (token: string) => verifyIdToken(token),
}));

vi.mock('@neram/database', async () => {
  const real = await import('../../../../../../packages/database/src/queries/learner-feedback');
  return {
    getSupabaseAdminClient: () => ({
      from: () => {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          limit: async () => ({ data: lastLearnerRows, error: null }),
        };
        return builder;
      },
    }),
    getUserByFirebaseUid: async () => dbUser,
    submitLearnerTestimonial: (...args: unknown[]) => submitLearnerTestimonial(...args),
    validateLearnerTestimonial: real.validateLearnerTestimonial,
    insertFunnelEvent: (...args: unknown[]) => insertFunnelEvent(...args),
  };
});

const ADULT = { id: 'user-1', first_name: 'Priya', last_name: 'Sundar', name: 'Priya Sundar', date_of_birth: '2000-04-02' };

const VALID = {
  text: 'The drawing classes and mock tests helped me a lot before NATA.',
  rating: 5,
  examType: 'NATA',
  year: 2026,
  city: 'Chennai',
  consentToPublish: true,
  displayName: 'Priya S.',
};

const INVALID_JSON = Symbol('invalid-json');

function makeRequest(body: unknown, authHeader: string | null = 'Bearer good') {
  return {
    headers: { get: (key: string) => (key === 'Authorization' ? authHeader : null) },
    json: async () => {
      if (body === INVALID_JSON) throw new SyntaxError('bad json');
      return body;
    },
  } as unknown as NextRequest;
}

async function post(body: unknown, authHeader: string | null = 'Bearer good') {
  const { POST } = await import('./route');
  return POST(makeRequest(body, authHeader));
}

type Call = [string, Record<string, unknown>];
const submittedInput = () => (submitLearnerTestimonial.mock.calls[0] as unknown as Call)[1];
const emittedEvent = () => (insertFunnelEvent.mock.calls[0] as unknown as [unknown, Record<string, any>])[1];

beforeEach(() => {
  dbUser = { ...ADULT };
  lastLearnerRows = [];
  submitLearnerTestimonial.mockClear();
  insertFunnelEvent.mockClear();
});

describe('POST /api/testimonials', () => {
  test('401 without a token', async () => {
    const res = await post(VALID, null);
    expect(res.status).toBe(401);
    expect(submitLearnerTestimonial).not.toHaveBeenCalled();
  });

  test('401 with a token Firebase rejects', async () => {
    const res = await post(VALID, 'Bearer bad');
    expect(res.status).toBe(401);
  });

  test('401 when the account cannot be resolved', async () => {
    dbUser = null;
    const res = await post(VALID);
    expect(res.status).toBe(401);
  });

  test('400 for a body that is not JSON', async () => {
    const res = await post(INVALID_JSON);
    expect(res.status).toBe(400);
  });

  test('400 with field errors for an invalid review', async () => {
    const res = await post({ ...VALID, text: 'too short', rating: 9, examType: 'GATE', city: '' });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(Object.keys(data.fieldErrors).sort()).toEqual(['city', 'examType', 'rating', 'text']);
    expect(submitLearnerTestimonial).not.toHaveBeenCalled();
  });

  test('201 for an adult, stored with isMinor false, and emits feedback_submitted', async () => {
    const res = await post(VALID);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'testimonial-1', status: 'pending_moderation' });
    expect((submitLearnerTestimonial.mock.calls[0] as unknown as Call)[0]).toBe('user-1');
    expect(submittedInput()).toMatchObject({ isMinor: false, consentToPublish: true, displayName: 'Priya S.', rating: 5, year: 2026 });

    expect(insertFunnelEvent).toHaveBeenCalledTimes(1);
    expect(emittedEvent()).toMatchObject({
      user_id: 'user-1',
      funnel: 'feedback',
      event: 'feedback_submitted',
      status: 'completed',
      source_app: 'app',
    });
    expect(emittedEvent().metadata).toMatchObject({ kind: 'testimonial', consent: true });
  });

  test('isMinor is derived on the server: a client claiming adulthood is ignored', async () => {
    dbUser = { ...ADULT, date_of_birth: '2012-06-01' };
    const res = await post({ ...VALID, isMinor: false, guardianConsent: false });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.fieldErrors.guardianConsent).toBeTruthy();
    expect(submitLearnerTestimonial).not.toHaveBeenCalled();
  });

  test('an unknown date of birth counts as a minor; guardian consent lets it through', async () => {
    dbUser = { ...ADULT, date_of_birth: null };
    const res = await post({ ...VALID, guardianConsent: true });
    expect(res.status).toBe(201);
    expect(submittedInput()).toMatchObject({ isMinor: true, guardianConsent: true });
  });

  test('an adult cannot send isMinor or guardian consent from the client', async () => {
    const res = await post({ ...VALID, isMinor: true, guardianConsent: true });
    expect(res.status).toBe(201);
    expect(submittedInput()).toMatchObject({ isMinor: false, guardianConsent: false });
  });

  test('a private review needs no display name and no guardian', async () => {
    dbUser = { ...ADULT, date_of_birth: null };
    const res = await post({ ...VALID, consentToPublish: false, displayName: 'ignored' });
    expect(res.status).toBe(201);
    expect(submittedInput()).toMatchObject({ consentToPublish: false, displayName: '' });
    expect(emittedEvent().metadata.consent).toBe(false);
  });

  test('429 when the learner sent a review in the last 30 days', async () => {
    lastLearnerRows = [{ created_at: new Date(Date.now() - 5 * 86400000).toISOString() }];
    const res = await post(VALID);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toMatch(/already have a review/);
    expect(data.error).not.toMatch(/—|--/);
    expect(data.nextAllowedAt).toBeTruthy();
    expect(submitLearnerTestimonial).not.toHaveBeenCalled();
  });

  test('allowed again after 30 days', async () => {
    lastLearnerRows = [{ created_at: new Date(Date.now() - 31 * 86400000).toISOString() }];
    const res = await post(VALID);
    expect(res.status).toBe(201);
  });

  test('a failed event insert does not fail the submission', async () => {
    insertFunnelEvent.mockRejectedValueOnce(new Error('db down'));
    const res = await post(VALID);
    expect(res.status).toBe(201);
  });
});

describe('GET /api/testimonials', () => {
  test('401 without a token', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest(null, null));
    expect(res.status).toBe(401);
  });

  test('tells the form about age, a suggested name and the rate limit', async () => {
    dbUser = { ...ADULT, date_of_birth: null };
    lastLearnerRows = [{ created_at: new Date(Date.now() - 2 * 86400000).toISOString() }];
    const { GET } = await import('./route');
    const res = await GET(makeRequest(null));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isMinor).toBe(true);
    expect(data.suggestedDisplayName).toBe('Priya S.');
    expect(data.nextAllowedAt).toBeTruthy();
  });
});
