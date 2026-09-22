// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ caller: vi.fn(), callPad: vi.fn(), hint: vi.fn() }));

vi.mock('@/lib/pad/caller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/caller')>()),
  resolvePadCaller: mocks.caller,
}));
vi.mock('@/lib/pad/sessions', () => ({ hintPrompt: mocks.hint, padDb: () => ({}) }));
vi.mock('@/lib/pad/rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/rpc')>()),
  callPad: mocks.callPad,
}));

import { PadRefusal } from '@/lib/pad/rpc';
import { POST } from './route';

const PROMPT = '22222222-2222-4222-8222-222222222222';
const STUDENT = { user: { id: 'student-1' }, role: 'student', internal: false };

const call = (body: unknown) =>
  POST(
    new NextRequest('http://localhost:3022/api/pad/skip', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  mocks.caller.mockReset().mockResolvedValue(STUDENT);
  mocks.hint.mockReset().mockResolvedValue(undefined);
  mocks.callPad.mockReset().mockResolvedValue({ ok: true, status: 'saved', reason: 'cant_see', note: null });
});

describe('POST /api/pad/skip', () => {
  it("records the student's reason and tells the teacher's console, throttled", async () => {
    const response = await call({ promptId: PROMPT, reason: 'cant_see' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'saved', reason: 'cant_see', note: null });
    expect(mocks.callPad).toHaveBeenCalledWith(expect.anything(), 'pad_set_skip_reason', {
      p_actor: 'student-1',
      p_prompt: PROMPT,
      p_reason: 'cant_see',
      p_note: null,
    });
    expect(mocks.hint).toHaveBeenCalledWith(PROMPT, 'teacher', { throttleMs: 1_000 });
  });

  it('says so when an answer was already locked, and bothers nobody', async () => {
    mocks.callPad.mockResolvedValue({ ok: true, status: 'answered' });
    expect(await (await call({ promptId: PROMPT, reason: 'dont_know' })).json()).toEqual({ status: 'answered', reason: null, note: null });
    expect(mocks.hint).not.toHaveBeenCalled();
  });

  it('refuses a teacher, a reason off the list, and a closed question', async () => {
    mocks.caller.mockResolvedValue({ user: { id: 'teacher-1' }, role: 'staff', internal: false });
    expect((await call({ promptId: PROMPT, reason: 'dont_know' })).status).toBe(403);

    mocks.caller.mockResolvedValue(STUDENT);
    const bad = await call({ promptId: PROMPT, reason: 'bored' });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: 'INVALID_INPUT', field: 'reason' });

    mocks.callPad.mockRejectedValue(new PadRefusal('PROMPT_NOT_OPEN'));
    expect((await call({ promptId: PROMPT, reason: 'dont_know' })).status).toBe(409);
  });
});
