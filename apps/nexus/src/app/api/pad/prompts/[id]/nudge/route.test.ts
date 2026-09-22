// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  caller: vi.fn(),
  promptSession: vi.fn(),
  meta: vi.fn(),
  roster: vi.fn(),
  roomCode: vi.fn(),
  hint: vi.fn(),
  prompt: vi.fn(),
  callPad: vi.fn(),
  sendNudge: vi.fn(),
}));

vi.mock('@/lib/pad/caller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/caller')>()),
  resolvePadCaller: mocks.caller,
}));
vi.mock('@/lib/pad/sessions', () => ({
  loadPromptSessionId: mocks.promptSession,
  loadSessionMeta: mocks.meta,
  rosterIds: mocks.roster,
  sessionRoomCode: mocks.roomCode,
  hintSession: mocks.hint,
  padDb: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.prompt }) }) }) }),
}));
vi.mock('@/lib/pad/rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/rpc')>()),
  callPad: mocks.callPad,
}));
vi.mock('@/lib/nudge-delivery', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/nudge-delivery')>()),
  sendNudge: mocks.sendNudge,
}));

import { PadRefusal } from '@/lib/pad/rpc';
import { POST } from './route';

const PROMPT = '22222222-2222-4222-8222-222222222222';
const TEACHER = { user: { id: 'teacher-1' }, role: 'staff', internal: false };

const call = (id = PROMPT) =>
  POST(new NextRequest(`http://localhost:3022/api/pad/prompts/${id}/nudge`, { method: 'POST', headers: { Authorization: 'Bearer token' } }), {
    params: { id },
  });

beforeEach(() => {
  mocks.caller.mockReset().mockResolvedValue(TEACHER);
  mocks.promptSession.mockReset().mockResolvedValue('s1');
  mocks.meta.mockReset().mockResolvedValue({ id: 's1', classroom_id: 'c1', batch_id: 'b1', teacher_id: 'teacher-1', status: 'live' });
  mocks.roster.mockReset().mockResolvedValue(['open-1', 'closed-1', 'closed-2', 'answered-1']);
  mocks.roomCode.mockReset().mockResolvedValue('482913');
  mocks.hint.mockReset().mockResolvedValue(undefined);
  mocks.prompt.mockReset().mockResolvedValue({ data: { sequence: 3, label: '38' }, error: null });
  mocks.callPad.mockReset().mockResolvedValue({ ok: true, pad_open: ['open-1'], pad_closed: ['closed-1', 'closed-2'] });
  mocks.sendNudge.mockReset().mockResolvedValue({ results: [], counts: { chat: 2 } });
});

describe('POST /api/pad/prompts/:id/nudge', () => {
  it('marks the class list, refreshes the open pads and sends the teacher\'s polite chat to the closed ones', async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ inPad: 1, chat: 2, chatDelivered: 2 });

    expect(mocks.callPad).toHaveBeenCalledWith(expect.anything(), 'pad_nudge', {
      p_actor: 'teacher-1',
      p_prompt: PROMPT,
      p_roster: ['open-1', 'closed-1', 'closed-2', 'answered-1'],
    });
    expect(mocks.roster).toHaveBeenCalledWith('c1', 'b1');
    expect(mocks.hint).toHaveBeenCalledWith('s1', 'everyone');

    const [input] = mocks.sendNudge.mock.calls[0];
    expect(input).toMatchObject({
      studentIds: ['closed-1', 'closed-2'],
      subject: 'Q.38 is waiting for your answer',
      eventType: 'pad_nudge',
      sendAs: { senderUserId: 'teacher-1' },
      source: { kind: 'pad_prompt', refId: PROMPT },
    });
    expect(input.plain).toBe(
      "Hi {firstName}, we're on Q.38 in class now. Please answer on the Answer Pad in the meeting. A guess is fine, or tap I can't answer and tell me why.",
    );
    expect(input.html).toContain('http://localhost:3022/pad/r/482913');
    expect(input.assistant).toBeUndefined();
    expect(JSON.stringify(input)).not.toMatch(/[–—]/);
  });

  it('sends no chat when every pad that needed nudging is open', async () => {
    mocks.callPad.mockResolvedValue({ ok: true, pad_open: ['open-1'], pad_closed: [] });
    expect(await (await call()).json()).toEqual({ inPad: 1, chat: 0, chatDelivered: 0 });
    expect(mocks.sendNudge).not.toHaveBeenCalled();
  });

  it('answers the database\'s minute limit with 429 and the seconds to wait', async () => {
    mocks.callPad.mockRejectedValue(new PadRefusal('RATE_LIMITED', { retry_after_seconds: 42 }));
    const response = await call();
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: 'RATE_LIMITED', retry_after_seconds: 42 });
    expect(mocks.sendNudge).not.toHaveBeenCalled();
  });

  it("refuses another teacher's class and a student, before marking anyone", async () => {
    mocks.caller.mockResolvedValue({ ...TEACHER, user: { id: 'teacher-2' } });
    expect((await call()).status).toBe(403);
    mocks.caller.mockResolvedValue({ user: { id: 'student-1' }, role: 'student', internal: false });
    expect((await call()).status).toBe(403);
    expect(mocks.callPad).not.toHaveBeenCalled();
  });

  it('answers 404 for a question that does not exist', async () => {
    mocks.promptSession.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect((await call('not-a-uuid')).status).toBe(404);
  });
});
