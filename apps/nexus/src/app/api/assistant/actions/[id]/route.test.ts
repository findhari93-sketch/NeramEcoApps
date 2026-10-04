// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolveAssistantCaller: vi.fn(), confirmAction: vi.fn(), cancelAction: vi.fn(), appendMessage: vi.fn() }));
vi.mock('@/lib/assistant/caller', () => ({ resolveAssistantCaller: mocks.resolveAssistantCaller, baseUrlOf: () => 'https://nexus.test' }));
vi.mock('@/lib/assistant/actions', () => ({ confirmAction: mocks.confirmAction, cancelAction: mocks.cancelAction }));
vi.mock('@/lib/assistant/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/assistant/store')>()),
  appendMessage: mocks.appendMessage,
}));
vi.mock('@neram/database/queries/nexus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@neram/database/queries/nexus')>()),
  getStudentPrimaryClassroom: async () => ({ id: 'c1' }),
}));

import { DELETE, POST } from './route';
import { ApiError } from '@/lib/api-errors';

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const caller = { id: 'u1', name: 'Priya', user_type: 'student', staff_role: null, can_teach: null, impersonating: false };
const ctx = { params: { id: ID } };
const post = (body: unknown) => new NextRequest('http://localhost/api/assistant/actions/a1', { method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const del = () => new NextRequest('http://localhost/api/assistant/actions/a1', { method: 'DELETE', headers: { Authorization: 'Bearer t' } });

beforeEach(() => {
  mocks.resolveAssistantCaller.mockReset().mockResolvedValue({ caller, supabase: {}, features: { sketchbook: true, attendance: true, tests: true, questionBank: true, inspiration: true } });
  mocks.confirmAction.mockReset();
  mocks.cancelAction.mockReset();
  mocks.appendMessage.mockReset().mockResolvedValue({ inserted: true, row: null });
});

describe('/api/assistant/actions/[id]', () => {
  it('confirms with the token, stores the reply in the thread, and returns it', async () => {
    mocks.confirmAction.mockResolvedValue({ ok: true, reply: 'Done.', links: [], threadId: 't1' });
    const res = await POST(post({ token: 'tok' }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, reply: 'Done.', links: [], threadId: 't1' });
    expect(mocks.confirmAction).toHaveBeenCalledWith(expect.objectContaining({ caller }), { id: ID, token: 'tok' });
    expect(mocks.appendMessage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ threadId: 't1', role: 'assistant', text: 'Done.' }));
  });

  it('passes a refusal through with its status and no thread write', async () => {
    mocks.confirmAction.mockResolvedValue({ ok: false, status: 410, error: 'expired' });
    const res = await POST(post({ token: 'tok' }), ctx);
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: 'expired' });
    expect(mocks.appendMessage).not.toHaveBeenCalled();
  });

  it('400s a missing token and DELETE cancels', async () => {
    expect((await POST(post({}), ctx)).status).toBe(400);
    mocks.cancelAction.mockResolvedValue({ ok: true, reply: 'Okay, cancelled. Nothing was changed.', links: [], threadId: 't1' });
    expect((await DELETE(del(), ctx)).status).toBe(200);
  });

  it('answers 404 for an id that is not a uuid, without touching the store (Ruling 26)', async () => {
    const bad = { params: { id: 'a1' } };
    const res = await POST(post({ token: 'tok' }), bad);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'That action is gone.' });
    expect((await DELETE(del(), bad)).status).toBe(404);
    expect(mocks.confirmAction).not.toHaveBeenCalled();
    expect(mocks.cancelAction).not.toHaveBeenCalled();
  });

  it('never shows a raw database error: logs it and answers 500 with a fixed sentence (Ruling 26)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.confirmAction.mockRejectedValue(Object.assign(new Error('relation "nexus_assistant_actions" does not exist'), { code: '42P01' }));
    const res = await POST(post({ token: 'tok' }), ctx);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Something went wrong on my side. Please try again.' });
    expect(String(log.mock.calls[0]?.join(' '))).toMatch(/nexus_assistant_actions/);
    log.mockRestore();
  });

  it('keeps an ApiError status and message', async () => {
    mocks.resolveAssistantCaller.mockRejectedValue(new ApiError('Neram Assistant is not switched on for your account yet.', 403));
    const res = await DELETE(del(), ctx);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Neram Assistant is not switched on for your account yet.' });
  });
});
