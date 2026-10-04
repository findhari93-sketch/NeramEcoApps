// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ caller: vi.fn(), callPad: vi.fn(), hint: vi.fn() }));

vi.mock('@/lib/pad/caller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/caller')>()),
  resolvePadCaller: mocks.caller,
}));
vi.mock('@/lib/pad/sessions', () => ({ hintSession: mocks.hint, padDb: () => ({}) }));
vi.mock('@/lib/pad/rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/rpc')>()),
  callPad: mocks.callPad,
}));

import { POST } from './route';

const SESSION = '11111111-1111-4111-8111-111111111111';
const STUDENT = { user: { id: 'student-1' }, role: 'student', internal: false };

const call = (body: unknown) =>
  POST(
    new NextRequest('http://localhost:3022/api/pad/join', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  mocks.caller.mockReset().mockResolvedValue(STUDENT);
  mocks.hint.mockReset().mockResolvedValue(undefined);
  mocks.callPad.mockReset();
});

describe('POST /api/pad/join', () => {
  it("tells the teacher's console when a student opens the pad for the first time in the round", async () => {
    mocks.callPad.mockResolvedValue({ ok: true, session_id: SESSION, first_touch: true });
    const response = await call({ meetingId: 'meeting-1' });
    expect(await response.json()).toEqual({ sessionId: SESSION });
    expect(mocks.callPad).toHaveBeenCalledWith(expect.anything(), 'pad_join_by_meeting', { p_actor: 'student-1', p_meeting_id: 'meeting-1' });
    expect(mocks.hint).toHaveBeenCalledWith(SESSION, 'teacher', { throttleMs: 1_000 });
  });

  it('stays quiet when the student was already here, or the teacher has not started', async () => {
    mocks.callPad.mockResolvedValueOnce({ ok: true, session_id: SESSION, first_touch: false });
    await call({ meetingId: 'meeting-1' });
    mocks.callPad.mockResolvedValueOnce({ ok: true, session_id: null });
    expect(await (await call({ meetingId: 'meeting-1' })).json()).toEqual({ sessionId: null });
    expect(mocks.hint).not.toHaveBeenCalled();
  });

  it('hints for a room code join too', async () => {
    mocks.callPad.mockResolvedValue({ ok: true, session_id: SESSION, first_touch: true });
    const response = await call({ code: '123 456' });
    expect(await response.json()).toEqual({ sessionId: SESSION });
    expect(mocks.hint).toHaveBeenCalledWith(SESSION, 'teacher', { throttleMs: 1_000 });
  });
});
