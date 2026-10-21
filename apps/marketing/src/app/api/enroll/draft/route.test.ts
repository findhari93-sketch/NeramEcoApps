// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The wizard draft: a signed-in student continues from any device. These pin
 * who may read what (a draft never unlocks the saved application), what is
 * stored, and that closed links take no drafts.
 */

type Row = Record<string, any>;
let link: Row | null;
let auth: Row | null;
const updates: { table: string; payload: Row; filters: Row[] }[] = [];
let updateResult: { data: Row | null; error: any } = { data: { id: 'link-1' }, error: null };

function chain(table: string) {
  let pending: Row | null = null;
  const filters: Row[] = [];
  const api: any = {
    update: (payload: Row) => {
      pending = payload;
      return api;
    },
    eq: (col: string, val: unknown) => {
      filters.push({ [col]: val });
      return api;
    },
    select: () => api,
    maybeSingle: async () => {
      if (pending) updates.push({ table, payload: pending, filters });
      return updateResult;
    },
  };
  return api;
}

vi.mock('@neram/database', () => ({
  createAdminClient: () => ({ from: (t: string) => chain(t) }),
  getDirectEnrollmentLinkByToken: async () => link,
}));
vi.mock('../../_lib/auth', () => ({ verifyFirebaseToken: async () => auth }));

import { GET, PUT, DELETE } from './route';

const future = new Date(Date.now() + 86400000).toISOString();
const baseLink = () => ({
  id: 'link-1',
  token: 'tok',
  status: 'active',
  expires_at: future,
  user_id: null,
  submitted_user_id: 'student',
  submitted_form: { firstName: 'Radhika', applicantCategory: 'school_student' },
  chosen_scheme: 'full',
  details_saved_at: '2026-10-20T17:20:52.000Z',
  draft_user_id: 'student',
  draft_form: { personal: { firstName: 'Radhik' } },
  draft_step: 1,
  draft_saved_at: '2026-10-20T17:10:00.000Z',
});

const get = (token = 'tok') => GET(new NextRequest(`http://x/api/enroll/draft?token=${token}`));
const put = (body: unknown) => PUT(new NextRequest('http://x/api/enroll/draft', { method: 'PUT', body: JSON.stringify(body) }));
const del = (token = 'tok') => DELETE(new NextRequest(`http://x/api/enroll/draft?token=${token}`, { method: 'DELETE' }));

beforeEach(() => {
  link = baseLink();
  auth = { userId: 'student', phoneVerified: true };
  updates.length = 0;
  updateResult = { data: { id: 'link-1' }, error: null };
});

describe('GET /api/enroll/draft', () => {
  it('needs a signed-in student', async () => {
    auth = null;
    expect((await get()).status).toBe(401);
  });

  it('returns the saved application and the draft to the student who wrote them', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.saved).toEqual({ form: link!.submitted_form, scheme: 'full', savedAt: link!.details_saved_at });
    expect(body.data.draft).toEqual({ form: link!.draft_form, step: 1, savedAt: link!.draft_saved_at });
  });

  it('gives a stranger who drafted on a leaked link only their own draft', async () => {
    link = { ...baseLink(), draft_user_id: 'stranger' };
    auth = { userId: 'stranger' };
    const body = await (await get()).json();
    expect(body.data.saved).toBeNull();
    expect(body.data.draft.step).toBe(1);
  });

  it('answers empty, not an error, once the link is closed', async () => {
    link = { ...baseLink(), status: 'payment_submitted' };
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { saved: null, draft: null, linkStatus: 'payment_submitted' } });
  });

  it('answers empty for an unknown token', async () => {
    link = null;
    const res = await get('nope');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { saved: null, draft: null, linkStatus: null } });
  });
});

describe('PUT /api/enroll/draft', () => {
  it('stores the wizard sections, the step and who wrote it, on the active link only', async () => {
    const res = await put({ token: 'tok', step: 2, formData: { personal: { firstName: 'Radhika' }, location: { city: 'Madurai' }, utmSource: 'x' } });
    expect(res.status).toBe(200);
    expect(updates).toHaveLength(1);
    const u = updates[0];
    expect(u.table).toBe('direct_enrollment_links');
    expect(u.payload.draft_form).toEqual({ personal: { firstName: 'Radhika' }, location: { city: 'Madurai' } });
    expect(u.payload.draft_step).toBe(2);
    expect(u.payload.draft_user_id).toBe('student');
    expect(typeof u.payload.draft_saved_at).toBe('string');
    expect(u.filters).toEqual(expect.arrayContaining([{ id: 'link-1' }, { status: 'active' }]));
    const body = await res.json();
    expect(body.data.savedAt).toBe(u.payload.draft_saved_at);
  });

  it('refuses a bad step or an oversized form', async () => {
    expect((await put({ token: 'tok', step: 9, formData: {} })).status).toBe(400);
    expect((await put({ token: 'tok', step: 1, formData: { personal: { address: 'x'.repeat(20000) } } })).status).toBe(400);
    expect(updates).toHaveLength(0);
  });

  it('needs a signed-in student', async () => {
    auth = null;
    expect((await put({ token: 'tok', step: 1, formData: {} })).status).toBe(401);
  });

  it('says NOT_ACTIVE for an expired or closed link and writes nothing', async () => {
    link = { ...baseLink(), expires_at: new Date(Date.now() - 1000).toISOString() };
    const res = await put({ token: 'tok', step: 1, formData: {} });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('NOT_ACTIVE');
    expect(updates).toHaveLength(0);
  });

  it('says NOT_ACTIVE when the link closed between the read and the write', async () => {
    updateResult = { data: null, error: null };
    const res = await put({ token: 'tok', step: 1, formData: {} });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/enroll/draft', () => {
  it('clears the draft the signed-in student wrote and leaves the saved application alone', async () => {
    const res = await del();
    expect(res.status).toBe(200);
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toEqual({ draft_form: null, draft_step: null, draft_saved_at: null, draft_user_id: null });
    expect(updates[0].filters).toEqual(expect.arrayContaining([{ id: 'link-1' }, { draft_user_id: 'student' }]));
  });

  it('does nothing for someone else', async () => {
    auth = { userId: 'other' };
    const res = await del();
    expect(res.status).toBe(200);
    expect(updates).toHaveLength(1);
    expect(updates[0].filters).toEqual(expect.arrayContaining([{ draft_user_id: 'other' }]));
  });
});
