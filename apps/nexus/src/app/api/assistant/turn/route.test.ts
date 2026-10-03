// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolveAssistantCaller: vi.fn(), runAssistantTurn: vi.fn() }));
vi.mock('@/lib/assistant/caller', () => ({ resolveAssistantCaller: mocks.resolveAssistantCaller, baseUrlOf: () => 'https://nexus.test' }));
vi.mock('@/lib/assistant/turn', () => ({ runAssistantTurn: mocks.runAssistantTurn, MAX_TEXT: 2000 }));

import { POST } from './route';
import { ApiError } from '@/lib/api-errors';

const caller = { id: 'u1', name: 'Priya', user_type: 'student', staff_role: null, can_teach: null, impersonating: false };
const THREAD = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const req = (body: unknown) => new NextRequest('http://localhost/api/assistant/turn', { method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => {
  mocks.resolveAssistantCaller.mockReset().mockResolvedValue({ caller, supabase: {}, features: { sketchbook: false, attendance: true } });
  mocks.runAssistantTurn.mockReset().mockResolvedValue({ reply: 'hi', suggestions: [], links: [], action: null, mode: 'general', threadId: 't1' });
});

describe('POST /api/assistant/turn', () => {
  it('runs the turn for the caller and returns the envelope, uncached', async () => {
    const res = await POST(req({ text: 'brief', threadId: THREAD, pageContext: { path: '/student/dashboard' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ reply: 'hi', threadId: 't1' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.runAssistantTurn).toHaveBeenCalledWith(expect.objectContaining({ caller, channel: 'nexus', text: 'brief', threadId: THREAD, pageContext: { path: '/student/dashboard' }, baseUrl: 'https://nexus.test', features: { sketchbook: false, attendance: true } }));
  });

  it('rejects a body with no text and no attachment, and a text over the cap', async () => {
    expect((await POST(req({}))).status).toBe(400);
    expect((await POST(req({ text: 'x'.repeat(2001) }))).status).toBe(400);
    expect(mocks.runAssistantTurn).not.toHaveBeenCalled();
  });

  it('only accepts https attachments', async () => {
    expect((await POST(req({ text: '', attachment: { original_image_url: 'http://x', thumbnail_url: null } }))).status).toBe(400);
    expect((await POST(req({ text: '', attachment: { original_image_url: 'https://cdn.test/a.jpg', thumbnail_url: null } }))).status).toBe(200);
  });

  it('maps the gate to its status', async () => {
    mocks.resolveAssistantCaller.mockRejectedValueOnce(new ApiError('Not found', 404));
    expect((await POST(req({ text: 'hi' }))).status).toBe(404);
  });

  it('treats a threadId that is not a uuid as absent, so the turn starts a fresh thread (Ruling 26)', async () => {
    await POST(req({ text: 'hi', threadId: 'not-a-uuid' }));
    expect(mocks.runAssistantTurn).toHaveBeenCalledWith(expect.objectContaining({ threadId: null }));
  });

  it('never shows a raw database error: logs it and answers 500 with a fixed sentence (Ruling 26)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.runAssistantTurn.mockRejectedValue({ message: 'invalid input syntax for type uuid', code: '22P02', details: null, hint: null });
    const res = await POST(req({ text: 'hi' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Something went wrong on my side. Please try again.' });
    expect(String(log.mock.calls[0]?.join(' '))).toMatch(/22P02/);
    log.mockRestore();
  });

  it('answers 401 with a plain sentence when the session has ended', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.resolveAssistantCaller.mockRejectedValueOnce(new Error('Invalid Microsoft token: 401'));
    const res = await POST(req({ text: 'hi' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Your session has ended. Sign in again.' });
  });
});
