// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ caller: vi.fn(), callPad: vi.fn(), hint: vi.fn(), store: vi.fn() }));

vi.mock('@/lib/pad/caller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/caller')>()),
  resolvePadCaller: mocks.caller,
}));
vi.mock('@/lib/pad/sessions', () => ({ padDb: () => ({}), hintPrompt: mocks.hint }));
vi.mock('@/lib/pad/store-results', () => ({ storeRoundResultsForPrompt: mocks.store }));
vi.mock('@/lib/pad/rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/rpc')>()),
  callPad: mocks.callPad,
}));

import { POST as submit } from './route';
import { POST as setKey } from '../prompts/[id]/key/route';

const PROMPT = '11111111-1111-4111-8111-111111111111';

const post = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.callPad.mockReset();
  mocks.hint.mockReset().mockResolvedValue(undefined);
  mocks.store.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/pad/submit with a formula', () => {
  beforeEach(() => {
    mocks.caller.mockReset().mockResolvedValue({ user: { id: 'student-1' }, role: 'student' });
    mocks.callPad.mockResolvedValue({ status: 'accepted', answer: '3.46410161514', raw_answer: '2√3', responded_at: 'now' });
  });

  it("sends the formula as typed and its value, which pad_submit stores", async () => {
    const response = await submit(post('http://localhost:3022/api/pad/submit', { promptId: PROMPT, answer: '2√3' }));
    expect(response.status).toBe(200);
    expect(mocks.callPad).toHaveBeenCalledWith(expect.anything(), 'pad_submit', {
      p_actor: 'student-1',
      p_prompt: PROMPT,
      p_raw: '2√3',
      p_value: '3.46410161514',
    });
  });

  it('sends no value for an answer that is not a number, such as a letter', async () => {
    await submit(post('http://localhost:3022/api/pad/submit', { promptId: PROMPT, answer: 'B' }));
    expect(mocks.callPad.mock.calls[0][2]).toMatchObject({ p_raw: 'B', p_value: null });
  });
});

describe('POST /api/pad/prompts/:id/key with a formula', () => {
  beforeEach(() => {
    mocks.caller.mockReset().mockResolvedValue({ user: { id: 'teacher-1' }, role: 'staff', internal: true });
    mocks.callPad.mockResolvedValue({ ok: true, changed: true, prompt_id: PROMPT, state: 'closed', version: 3 });
  });

  it("sends each key's value beside it, null where a key is not a number", async () => {
    const response = await setKey(post(`http://localhost:3022/api/pad/prompts/${PROMPT}/key`, { keys: ['2√3', 'x'] }), { params: { id: PROMPT } });
    expect(response.status).toBe(200);
    expect(mocks.callPad).toHaveBeenCalledWith(expect.anything(), 'pad_set_key', {
      p_actor: 'teacher-1',
      p_prompt: PROMPT,
      p_keys: ['2√3', 'x'],
      p_ungraded: false,
      p_key_values: ['3.46410161514', null],
    });
  });

  it('sends no values for Poll', async () => {
    await setKey(post(`http://localhost:3022/api/pad/prompts/${PROMPT}/key`, { ungraded: true }), { params: { id: PROMPT } });
    expect(mocks.callPad.mock.calls[0][2]).toMatchObject({ p_keys: null, p_ungraded: true, p_key_values: null });
  });
});
