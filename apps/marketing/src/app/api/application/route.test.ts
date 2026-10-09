// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const calls: Array<{ table: string; op: string; payload?: unknown; filters: unknown[] }> = [];
let existingApplications: any[] = [];
let singleRow: any = null;

function chain(table: string) {
  const record = { table, op: '', payload: undefined as unknown, filters: [] as unknown[] };
  calls.push(record);
  const api: any = {
    update: (payload: unknown) => {
      record.op = 'update';
      record.payload = payload;
      return api;
    },
    select: () => api,
    eq: (...args: unknown[]) => {
      record.filters.push(['eq', ...args]);
      return api;
    },
    is: (...args: unknown[]) => {
      record.filters.push(['is', ...args]);
      return api;
    },
    single: async () => ({ data: singleRow ?? { id: existingApplications[0]?.id || 'lead-new', application_number: 'NERAM-2609-00042' }, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
  };
  // The users mirror awaits the chain itself (no .single()); resolve like PostgREST does.
  api.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
  return api;
}

const supabase = { from: (table: string) => chain(table) };

vi.mock('@neram/database', () => ({
  createAdminClient: () => supabase,
  sendTemplateEmail: vi.fn(async () => undefined),
  notifyNewApplication: vi.fn(async () => undefined),
  parseExamYearAnswer: (v: unknown) => ({
    examYear: typeof v === 'string' ? Number(v.slice(0, 4)) : null,
    academicYear: typeof v === 'string' ? v : null,
  }),
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const createApplication = vi.fn(async (_client: unknown, input: any) => ({ id: 'lead-new', ...input }));
const submitApplication = vi.fn(async (_client: unknown, id: string) => ({
  id,
  application_number: 'NERAM-2609-00042',
  interest_course: 'nata',
}));
vi.mock('@neram/database/queries', () => ({
  createApplication: (...args: unknown[]) => createApplication(...(args as [unknown, unknown])),
  getApplicationsByUserId: async () => existingApplications,
  submitApplication: (...args: unknown[]) => submitApplication(...(args as [unknown, string])),
  hasExistingApplication: async () => existingApplications.length > 0,
  deleteApplication: vi.fn(),
}));

const INDIAN_AUTH = { userId: 'user-1', email: 'arun@example.com', name: 'Arun', phone: '+919876543210', phoneVerified: true };
let authResult: typeof INDIAN_AUTH = INDIAN_AUTH;
vi.mock('../_lib/auth', () => ({
  verifyFirebaseToken: async () => authResult,
}));

import { POST, PATCH } from './route';

function request(method: string, body: unknown, url = 'http://localhost/api/application') {
  return new NextRequest(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

const submitBody = {
  status: 'submitted',
  first_name: 'Arun',
  father_name: 'Rajendran',
  email: 'arun@example.com',
  phone: '9876543210',
  parent_phone: '9123456789',
  date_of_birth: '2008-03-12',
  gender: 'male',
  phone_verified: true,
  applicant_category: 'school_student',
  interest_course: 'nata',
  fee_structure_id: 'fs-1',
  fee_source: 'standard',
  target_exam_year: '2027-28',
  gclid: 'g-1',
};

beforeEach(() => {
  calls.length = 0;
  existingApplications = [];
  singleRow = null;
  authResult = INDIAN_AUTH;
  createApplication.mockClear();
  submitApplication.mockClear();
});

describe('POST /api/application', () => {
  it('passes the contact, fee and click-id fields to createApplication', async () => {
    const res = await POST(request('POST', submitBody));
    expect(res.status).toBe(201);
    const input = createApplication.mock.calls[0][1];
    expect(input).toMatchObject({
      user_id: 'user-1',
      first_name: 'Arun',
      email: 'arun@example.com',
      phone: '9876543210',
      parent_phone: '9123456789',
      date_of_birth: '2008-03-12',
      gender: 'male',
      fee_structure_id: 'fs-1',
      fee_source: 'standard',
      gclid: 'g-1',
      status: 'submitted',
    });
  });

  it('mirrors date of birth and gender onto users, and email or phone only when null', async () => {
    await POST(request('POST', submitBody));
    const userUpdates = calls.filter((c) => c.table === 'users' && c.op === 'update');
    const profileUpdate = userUpdates.find((c) => (c.payload as any).date_of_birth);
    expect(profileUpdate?.payload).toMatchObject({ first_name: 'Arun', date_of_birth: '2008-03-12', gender: 'male' });
    const emailUpdate = userUpdates.find((c) => (c.payload as any).email);
    expect(emailUpdate?.filters).toContainEqual(['is', 'email', null]);
    const phoneUpdate = userUpdates.find((c) => (c.payload as any).phone);
    expect(phoneUpdate?.filters).toContainEqual(['is', 'phone', null]);
  });

  it('rejects an invalid gender or fee_source instead of forwarding it', async () => {
    await POST(request('POST', { ...submitBody, gender: 'x', fee_source: 'gift' }));
    const input = createApplication.mock.calls[0][1];
    expect(input.gender).toBeUndefined();
    expect(input.fee_source).toBeUndefined();
  });

  it('marks a Gulf number verified when it is the OTP-verified one on the account, and keeps its code', async () => {
    authResult = { ...INDIAN_AUTH, phone: '+971501234567' };
    const res = await POST(request('POST', { ...submitBody, phone: '+971501234567', parent_phone: '+971509876543' }));
    expect(res.status).toBe(201);
    expect(createApplication.mock.calls[0][1]).toMatchObject({ phone: '+971501234567', parent_phone: '+971509876543', phone_verified: true });
  });

  it('never trusts phone_verified from the browser for a number the account did not verify', async () => {
    const res = await POST(request('POST', { ...submitBody, phone: '9000000001' }));
    expect(res.status).toBe(400);
    expect(createApplication).not.toHaveBeenCalled();
  });

  it('updates the existing draft rather than inserting a second application', async () => {
    existingApplications = [{ id: 'lead-draft', status: 'draft' }];
    await POST(request('POST', submitBody));
    expect(createApplication).not.toHaveBeenCalled();
    const update = calls.find((c) => c.table === 'lead_profiles' && c.op === 'update');
    expect(update?.filters).toContainEqual(['eq', 'id', 'lead-draft']);
    expect(submitApplication).toHaveBeenCalledWith(supabase, 'lead-draft');
  });
});

describe('PATCH /api/application', () => {
  it('whitelists the new fields', async () => {
    singleRow = { id: 'lead-1', user_id: 'user-1', status: 'submitted' };
    const res = await PATCH(
      request(
        'PATCH',
        { email: 'new@example.com', parent_phone: '9000000000', fee_structure_id: 'fs-2', status: 'enrolled', assigned_fee: 1 },
        'http://localhost/api/application?id=lead-1',
      ),
    );
    expect(res.status).toBe(200);
    const update = calls.find((c) => c.table === 'lead_profiles' && c.op === 'update');
    expect(update?.payload).toMatchObject({ email: 'new@example.com', parent_phone: '9000000000', fee_structure_id: 'fs-2', fee_source: 'standard' });
    expect(update?.payload).not.toHaveProperty('status');
    expect(update?.payload).not.toHaveProperty('assigned_fee');
  });
  it('keeps an admin or link fee_source when the applicant edits their programme', async () => {
    for (const source of ['admin', 'link']) {
      calls.length = 0;
      singleRow = { id: 'lead-1', user_id: 'user-1', status: 'submitted', fee_source: source, final_fee: 18000 };
      await PATCH(request('PATCH', { fee_structure_id: 'fs-2' }, 'http://localhost/api/application?id=lead-1'));
      const update = calls.find((c) => c.table === 'lead_profiles' && c.op === 'update');
      expect(update?.payload).toMatchObject({ fee_structure_id: 'fs-2' });
      expect(update?.payload).not.toHaveProperty('fee_source');
    }
  });
});
