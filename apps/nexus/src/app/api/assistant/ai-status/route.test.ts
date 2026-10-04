// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-errors';

const mocks = vi.hoisted(() => ({ resolveAssistantCaller: vi.fn(), buildAiStatus: vi.fn() }));
vi.mock('@/lib/assistant/caller', () => ({ resolveAssistantCaller: mocks.resolveAssistantCaller }));
vi.mock('@/lib/assistant/ai-access', () => ({ buildAiStatus: mocks.buildAiStatus }));

import { GET } from './route';

const req = () => new NextRequest('http://localhost/api/assistant/ai-status', { headers: { Authorization: 'Bearer t' } });

beforeEach(() => {
  mocks.resolveAssistantCaller.mockReset();
  mocks.buildAiStatus.mockReset();
});

describe('GET /api/assistant/ai-status', () => {
  it('returns the caller\'s own status, never cached', async () => {
    mocks.resolveAssistantCaller.mockResolvedValue({ caller: { id: 's1' }, supabase: {}, features: {} });
    mocks.buildAiStatus.mockResolvedValue({ on: true, reason: 'caught_up', sentence: 'AI answers: on, 7 left today.', link: null, left_today: 7, daily_limit: 10 });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toMatchObject({ on: true, left_today: 7 });
    expect(mocks.buildAiStatus).toHaveBeenCalledWith({}, 's1', expect.any(Date), { impersonating: undefined });
  });

  it('tells buildAiStatus when a teacher is viewing as the student', async () => {
    mocks.resolveAssistantCaller.mockResolvedValue({ caller: { id: 's1', impersonating: true }, supabase: {}, features: {} });
    mocks.buildAiStatus.mockResolvedValue({ on: false });
    await GET(req());
    expect(mocks.buildAiStatus).toHaveBeenCalledWith({}, 's1', expect.any(Date), { impersonating: true });
  });

  it('is 404 while the assistant is off', async () => {
    mocks.resolveAssistantCaller.mockRejectedValue(new ApiError('Not found', 404));
    expect((await GET(req())).status).toBe(404);
  });
});
