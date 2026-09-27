import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * POST /api/testimonials stores a student's own review of Neram. What this pins:
 * a missing token is a 401 (not a 500), invalid answers are a 400 with field
 * messages, the under-18 rule is decided from users.date_of_birth on the server
 * whatever the client claims, and one review per 30 days answers 429.
 */

const verifyMsToken = vi.fn();
const getRequestUser = vi.fn();
const submitLearnerTestimonial = vi.fn();
const results: Record<string, unknown> = {};

function table(name: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'gte']) b[m] = () => b;
  b.maybeSingle = async () => results[name] ?? { data: null, error: null };
  return b;
}

vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: (...a: unknown[]) => verifyMsToken(...a) }));
vi.mock('@/lib/study-materials', () => ({ getRequestUser: (...a: unknown[]) => getRequestUser(...a) }));
vi.mock('@neram/database', async () => {
  const lf = await vi.importActual<typeof import('../../../../../../packages/database/src/queries/learner-feedback')>(
    '../../../../../../packages/database/src/queries/learner-feedback',
  );
  return {
    getSupabaseAdminClient: () => ({ from: (name: string) => table(name) }),
    validateLearnerTestimonial: lf.validateLearnerTestimonial,
    submitLearnerTestimonial: (...a: unknown[]) => submitLearnerTestimonial(...a),
  };
});

import { GET, POST } from './route';

const student = { id: 'u1', user_type: 'student', student_program: null, name: 'Asha K', staff_role: null, can_teach: null };

const valid = {
  text: 'The drawing classes helped me a lot and the teachers were patient.',
  rating: 5,
  examType: 'NATA',
  year: new Date().getFullYear(),
  city: 'Chennai',
  displayName: 'Asha K.',
  consentToPublish: true,
  guardianConsent: false,
};

function post(body: unknown, auth: string | null = 'Bearer t') {
  return new NextRequest('http://localhost/api/testimonials', {
    method: 'POST',
    headers: { ...(auth ? { Authorization: auth } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  verifyMsToken.mockReset();
  getRequestUser.mockReset();
  submitLearnerTestimonial.mockReset();
  for (const k of Object.keys(results)) delete results[k];
  vi.spyOn(console, 'error').mockImplementation(() => {});

  verifyMsToken.mockImplementation(async (header: string | null) => {
    if (!header) throw new Error('Missing or invalid Authorization header');
    return { oid: 'o1', email: 'asha@neramclasses.com', name: 'Asha K', displayName: 'Asha K' };
  });
  getRequestUser.mockResolvedValue(student);
  submitLearnerTestimonial.mockResolvedValue({ id: 't1' });
  results.users = { data: { date_of_birth: '2000-01-01' }, error: null };
});

describe('POST /api/testimonials', () => {
  it('answers 401 without a token, not 500', async () => {
    const res = await POST(post(valid, null));
    expect(res.status).toBe(401);
    expect(submitLearnerTestimonial).not.toHaveBeenCalled();
  });

  it('answers 403 for a teacher', async () => {
    getRequestUser.mockResolvedValueOnce({ ...student, user_type: 'teacher' });
    expect((await POST(post(valid))).status).toBe(403);
  });

  it('answers 403 when a teacher is viewing as the student', async () => {
    verifyMsToken.mockResolvedValueOnce({ oid: 'o1', email: 'a', name: 'A', displayName: 'A', impersonatorUserId: 'staff-1' });
    expect((await POST(post(valid))).status).toBe(403);
    expect(submitLearnerTestimonial).not.toHaveBeenCalled();
  });

  it('answers 400 with field messages for invalid answers', async () => {
    const res = await POST(post({ ...valid, text: 'Too short', rating: 9, city: '' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(Object.keys(body.fieldErrors).sort()).toEqual(['city', 'rating', 'text']);
    expect(submitLearnerTestimonial).not.toHaveBeenCalled();
  });

  it('treats an unknown date of birth as a minor, whatever the client says', async () => {
    results.users = { data: { date_of_birth: null }, error: null };
    const res = await POST(post({ ...valid, isMinor: false }));
    expect(res.status).toBe(400);
    expect((await res.json()).fieldErrors.guardianConsent).toBeTruthy();
    expect(submitLearnerTestimonial).not.toHaveBeenCalled();
  });

  it('passes the server-derived isMinor to the store', async () => {
    results.users = { data: { date_of_birth: '2012-03-01' }, error: null };
    const res = await POST(post({ ...valid, guardianConsent: true, isMinor: false }));
    expect(res.status).toBe(201);
    expect(submitLearnerTestimonial).toHaveBeenCalledWith('u1', expect.objectContaining({ isMinor: true, guardianConsent: true }));
  });

  it('ignores a client claim of being a minor for an adult', async () => {
    const res = await POST(post({ ...valid, isMinor: true }));
    expect(res.status).toBe(201);
    expect(submitLearnerTestimonial).toHaveBeenCalledWith('u1', expect.objectContaining({ isMinor: false }));
    const body = await res.json();
    expect(body.status).toBe('pending_moderation');
    expect(body.nextAllowedAt).toBeTruthy();
  });

  it('answers 429 when the student wrote in the last 30 days', async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    results.testimonials = { data: { submitted_at: fiveDaysAgo, created_at: fiveDaysAgo }, error: null };
    const res = await POST(post(valid));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/You can write again from/);
    expect(body.error).not.toMatch(/—|--/);
    expect(submitLearnerTestimonial).not.toHaveBeenCalled();
  });

  it('allows a new review once 30 days have passed', async () => {
    const longAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    results.testimonials = { data: { submitted_at: longAgo, created_at: longAgo }, error: null };
    expect((await POST(post(valid))).status).toBe(201);
  });

  it('answers 503, not 201, when the store fails', async () => {
    submitLearnerTestimonial.mockRejectedValueOnce({ code: '42703', message: 'column does not exist' });
    expect((await POST(post(valid))).status).toBe(503);
  });
});

describe('GET /api/testimonials', () => {
  it('answers 401 without a token', async () => {
    const res = await GET(new NextRequest('http://localhost/api/testimonials'));
    expect(res.status).toBe(401);
  });

  it('tells the form whether the student is a minor and when they may write again', async () => {
    results.users = { data: { date_of_birth: null }, error: null };
    const res = await GET(new NextRequest('http://localhost/api/testimonials', { headers: { Authorization: 'Bearer t' } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ isMinor: true, lastSubmittedAt: null, nextAllowedAt: null });
  });
});
