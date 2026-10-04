// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ caller: vi.fn(), callPad: vi.fn() }));

vi.mock('@/lib/pad/caller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/caller')>()),
  resolvePadCaller: mocks.caller,
}));
vi.mock('@/lib/pad/sessions', () => ({ padDb: () => ({}) }));
vi.mock('@/lib/pad/rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/rpc')>()),
  callPad: mocks.callPad,
}));

import { POST } from './route';

const SESSION = '11111111-1111-4111-8111-111111111111';
const TEACHER = { user: { id: 'teacher-1' }, role: 'staff', internal: true };

const call = (id: string, body: unknown) =>
  POST(
    new NextRequest(`http://localhost:3022/api/pad/sessions/${id}/title`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: { id } },
  );

beforeEach(() => {
  mocks.caller.mockReset().mockResolvedValue(TEACHER);
  mocks.callPad.mockReset().mockResolvedValue({ ok: true, title: 'JEE preparation' });
});

describe('POST /api/pad/sessions/:id/title', () => {
  it('renames the class for its teacher and answers with the title now shown', async () => {
    const response = await call(SESSION, { title: 'JEE preparation' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ title: 'JEE preparation' });
    expect(mocks.callPad).toHaveBeenCalledWith(expect.anything(), 'pad_rename_session', {
      p_actor: 'teacher-1',
      p_session: SESSION,
      p_title: 'JEE preparation',
    });
  });

  it('clears the title with null', async () => {
    await call(SESSION, { title: null });
    expect(mocks.callPad).toHaveBeenCalledWith(expect.anything(), 'pad_rename_session', expect.objectContaining({ p_title: null }));
  });

  it('refuses a title that is not text, and an id that is not a session', async () => {
    expect((await call(SESSION, { title: 42 })).status).toBe(400);
    expect((await call(SESSION, {})).status).toBe(400);
    expect((await call('nope', { title: 'x' })).status).toBe(404);
    expect(mocks.callPad).not.toHaveBeenCalled();
  });
});
