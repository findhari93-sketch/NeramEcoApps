// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ caller: vi.fn(), callPad: vi.fn(), hint: vi.fn() }));

vi.mock('@/lib/pad/caller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/caller')>()),
  resolvePadCaller: mocks.caller,
}));
vi.mock('@/lib/pad/sessions', () => ({ padDb: () => ({}), hintSession: mocks.hint }));
vi.mock('@/lib/pad/rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/rpc')>()),
  callPad: mocks.callPad,
}));

import { PadRefusal } from '@/lib/pad/rpc';
import { POST } from './route';

const SESSION = '11111111-1111-4111-8111-111111111111';
const STUDENT = '22222222-2222-4222-8222-222222222222';
const TEACHER = { user: { id: 'teacher-1' }, role: 'staff', internal: true };

const call = (id: string, body: unknown) =>
  POST(
    new NextRequest(`http://localhost:3022/api/pad/sessions/${id}/cant-use-pad`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: { id } },
  );

beforeEach(() => {
  mocks.caller.mockReset().mockResolvedValue(TEACHER);
  mocks.callPad.mockReset().mockResolvedValue({ ok: true, on: true, questions: 2 });
  mocks.hint.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/pad/sessions/:id/cant-use-pad', () => {
  it("marks a student for the round teacher, and tells every screen", async () => {
    const response = await call(SESSION, { studentId: STUDENT, on: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ on: true, questions: 2 });
    expect(mocks.callPad).toHaveBeenCalledWith(expect.anything(), 'pad_mark_cant_use_pad', {
      p_actor: 'teacher-1',
      p_session: SESSION,
      p_student: STUDENT,
      p_on: true,
    });
    expect(mocks.hint).toHaveBeenCalledWith(SESSION, 'everyone');
  });

  it('refuses a student who is not an id, a missing on, and a session that is not an id', async () => {
    expect((await call(SESSION, { studentId: 'x', on: true })).status).toBe(400);
    expect((await call(SESSION, { studentId: STUDENT })).status).toBe(400);
    expect((await call('nope', { studentId: STUDENT, on: true })).status).toBe(404);
    expect(mocks.callPad).not.toHaveBeenCalled();
  });

  it('is for staff only', async () => {
    mocks.caller.mockResolvedValue({ user: { id: 'student-1' }, role: 'student', internal: true });
    expect((await call(SESSION, { studentId: STUDENT, on: true })).status).toBe(403);
    expect(mocks.callPad).not.toHaveBeenCalled();
  });

  it("passes the database's refusal on, and hints no one", async () => {
    mocks.callPad.mockRejectedValue(new PadRefusal('NOT_SESSION_TEACHER'));
    expect((await call(SESSION, { studentId: STUDENT, on: false })).status).toBe(403);
    expect(mocks.hint).not.toHaveBeenCalled();
  });
});
