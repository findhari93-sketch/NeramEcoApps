// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { fakeDb } from '@/lib/assistant/testing/fake-db';
import { ApiError } from '@/lib/api-errors';

const mocks = vi.hoisted(() => ({
  getRequestUser: vi.fn(),
  assertStaffSeesStudent: vi.fn(),
  readAssistantGate: vi.fn(),
  loadAiAccess: vi.fn(),
  setOverride: vi.fn(),
  clearOverrides: vi.fn(),
}));
vi.mock('@/lib/study-materials', () => ({ getRequestUser: mocks.getRequestUser }));
vi.mock('@/lib/sketchbook-access', () => ({ assertStaffSeesStudent: mocks.assertStaffSeesStudent }));
vi.mock('@/lib/assistant/access', () => ({ readAssistantGate: mocks.readAssistantGate }));
vi.mock('@/lib/assistant/ai-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/assistant/ai-access')>()),
  loadAiAccess: mocks.loadAiAccess,
  setOverride: mocks.setOverride,
  clearOverrides: mocks.clearOverrides,
}));
vi.mock('@neram/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@neram/database')>()),
  getSupabaseAdminClient: () =>
    fakeDb({
      users: [
        { id: '11111111-1111-4111-8111-111111111111', user_type: 'student', name: 'Priya' },
        { id: '22222222-2222-4222-8222-222222222222', user_type: 'teacher', name: 'Ms Rao' },
      ],
    }),
}));

import { DELETE, GET, POST } from './route';

const STU = '11111111-1111-4111-8111-111111111111';
const T1 = '22222222-2222-4222-8222-222222222222';
const on = { on: true, reason: 'caught_up', sentence: 'AI answers: on.', link: null, missed: [], missedCount: 0, deficit: 0, override: null };
const req = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/students/stu/ai-access', {
    method,
    headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRequestUser.mockResolvedValue({ id: T1, user_type: 'teacher', staff_role: 'teacher', can_teach: true });
  mocks.readAssistantGate.mockResolvedValue({ enabled: true, pilot: [], features: {} });
  mocks.assertStaffSeesStudent.mockResolvedValue(undefined);
});

describe('/api/students/[id]/ai-access', () => {
  it('GET answers the teacher line for a student this teacher sees', async () => {
    mocks.loadAiAccess.mockResolvedValue(on);
    const res = await GET(req('GET'), { params: { id: STU } });
    expect(await res.json()).toEqual({ on: true, line: 'On: all caught up.', override: null });
    expect(mocks.assertStaffSeesStudent).toHaveBeenCalledWith(expect.objectContaining({ id: T1 }), STU);
  });

  it('is 404 while the assistant is off, and for a non-student id', async () => {
    mocks.readAssistantGate.mockResolvedValueOnce({ enabled: false, pilot: [], features: {} });
    expect((await GET(req('GET'), { params: { id: STU } })).status).toBe(404);
    expect((await GET(req('GET'), { params: { id: T1 } })).status).toBe(404);
  });

  it('answers a malformed id with 404 before any lookup', async () => {
    const res = await GET(req('GET'), { params: { id: 'not-a-uuid' } });
    expect(res.status).toBe(404);
    expect(mocks.assertStaffSeesStudent).not.toHaveBeenCalled();
  });

  it('never shows database text: a failing load is a fixed 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.loadAiAccess.mockRejectedValue({ message: 'relation does not exist', code: '42P01' });
    const res = await GET(req('GET'), { params: { id: STU } });
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).toContain('Something went wrong. Please try again.');
    expect(text).not.toContain('relation');
    spy.mockRestore();
  });

  it('refuses a teacher who does not teach the student', async () => {
    mocks.assertStaffSeesStudent.mockRejectedValueOnce(new ApiError('You do not teach this student.', 403));
    expect((await GET(req('GET'), { params: { id: STU } })).status).toBe(403);
  });

  it('POST needs on or off, a reason of 1 to 200 characters, and an end date that is not in the past', async () => {
    for (const body of [
      { mode: 'maybe', reason: 'x' },
      { mode: 'on', reason: '   ' },
      { mode: 'on', reason: 'x'.repeat(201) },
      { mode: 'on', reason: 'ok', ends_on: '2020-01-01' },
      { mode: 'on', reason: 'ok', ends_on: 'soon' },
    ]) {
      expect((await POST(req('POST', body), { params: { id: STU } })).status).toBe(400);
    }
    expect(mocks.setOverride).not.toHaveBeenCalled();
  });

  it('POST sets the override as this teacher and answers the new view', async () => {
    mocks.setOverride.mockResolvedValue({});
    mocks.loadAiAccess.mockResolvedValue({
      ...on,
      reason: 'teacher_on',
      override: { id: 'o', student_id: STU, mode: 'on', reason: 'Was ill', set_by: T1, set_at: '2026-10-03T05:00:00Z', ends_on: null, cleared_at: null, cleared_by: null },
    });
    const res = await POST(req('POST', { mode: 'on', reason: 'Was ill' }), { params: { id: STU } });
    expect(mocks.setOverride).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ studentId: STU, mode: 'on', reason: 'Was ill', endsOn: null, setBy: T1 }));
    expect(await res.json()).toMatchObject({ line: 'On: set by a teacher (Was ill).', override: { set_by_name: 'Ms Rao' } });
  });

  it('DELETE clears as this teacher', async () => {
    mocks.loadAiAccess.mockResolvedValue(on);
    await DELETE(req('DELETE'), { params: { id: STU } });
    expect(mocks.clearOverrides).toHaveBeenCalledWith(expect.anything(), STU, T1, expect.any(Date));
  });
});
