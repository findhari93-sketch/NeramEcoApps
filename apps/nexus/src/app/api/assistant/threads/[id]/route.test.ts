// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolveAssistantCaller: vi.fn(), getThread: vi.fn(), listMessages: vi.fn() }));
vi.mock('@/lib/assistant/caller', () => ({ resolveAssistantCaller: mocks.resolveAssistantCaller }));
vi.mock('@/lib/assistant/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/assistant/store')>()),
  getThread: mocks.getThread,
  listMessages: mocks.listMessages,
}));

import * as route from './route';
import { GET } from './route';

const ID = '9b2c1d7e-3a4f-4b5c-8d6e-7f8091a2b3c4';
const caller = { id: 'u1', name: 'Priya', user_type: 'student', staff_role: null, can_teach: null, impersonating: false };
const req = () => new NextRequest(`http://localhost/api/assistant/threads/${ID}`, { headers: { Authorization: 'Bearer t' } });

beforeEach(() => {
  mocks.resolveAssistantCaller.mockReset().mockResolvedValue({ caller, supabase: {}, features: { sketchbook: true, attendance: true, tests: true, questionBank: true, inspiration: true } });
  mocks.getThread.mockReset().mockResolvedValue({ id: ID, user_id: 'u1' });
  mocks.listMessages.mockReset().mockResolvedValue([{ id: 'm1', role: 'user', text: 'hi', envelope: null, created_at: '2026-10-03T04:30:00Z' }]);
});

describe('GET /api/assistant/threads/[id]', () => {
  it('returns the messages of the caller\u2019s own thread, uncached', async () => {
    const res = await GET(req(), { params: { id: ID } });
    expect(res.status).toBe(200);
    expect((await res.json()).messages).toHaveLength(1);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('re-filters stored chips under today’s switches (parked minor c)', async () => {
    mocks.resolveAssistantCaller.mockResolvedValue({
      caller, supabase: {}, features: { sketchbook: false, attendance: true, tests: true, questionBank: true, inspiration: true },
    });
    mocks.listMessages.mockResolvedValue([{
      id: 'm2', role: 'assistant', text: 'ok', created_at: '2026-10-03T04:30:00Z',
      envelope: { suggestions: [{ label: 'Add a sketch', send: 'Add a sketch' }, { label: "What's due?", send: "What's due?" }] },
    }]);
    const body = await (await GET(req(), { params: { id: ID } })).json();
    expect(body.messages[0].envelope.suggestions.map((s: { label: string }) => s.label)).toEqual(["What's due?"]);
  });

  it('answers 404 for an id that is not a uuid, without touching the store (Ruling 26)', async () => {
    const res = await GET(req(), { params: { id: 'kept' } });
    expect(res.status).toBe(404);
    expect(mocks.getThread).not.toHaveBeenCalled();
  });

  it('answers 404 for another student\u2019s thread', async () => {
    mocks.getThread.mockResolvedValue({ id: ID, user_id: 'u9' });
    expect((await GET(req(), { params: { id: ID } })).status).toBe(404);
  });

  it('never shows a raw database error (Ruling 26)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.listMessages.mockRejectedValue(new Error('Assistant store: canceling statement due to statement timeout code=57014'));
    const res = await GET(req(), { params: { id: ID } });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Something went wrong on my side. Please try again.' });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('keeps the uncached Graph /me fetch out of the Data Cache (GET-only route, item 6)', () => {
    expect(route.fetchCache).toBe('force-no-store');
  });
});
