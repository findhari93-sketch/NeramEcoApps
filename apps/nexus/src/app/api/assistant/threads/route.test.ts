// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolveAssistantCaller: vi.fn(), createThread: vi.fn() }));
vi.mock('@/lib/assistant/caller', () => ({ resolveAssistantCaller: mocks.resolveAssistantCaller }));
vi.mock('@/lib/assistant/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/assistant/store')>()),
  createThread: mocks.createThread,
}));

import { POST } from './route';

const caller = { id: 'u1', name: 'Priya', user_type: 'student', staff_role: null, can_teach: null, impersonating: false };
const req = (body: unknown) => new NextRequest('http://localhost/api/assistant/threads', { method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => {
  mocks.resolveAssistantCaller.mockReset().mockResolvedValue({ caller, supabase: {}, features: { sketchbook: true, attendance: true, tests: true, questionBank: true, inspiration: true } });
  mocks.createThread.mockReset().mockResolvedValue({ id: 't-new' });
});

describe('POST /api/assistant/threads', () => {
  it('stores only a validated page context, as the turn route does (item 7)', async () => {
    const res = await POST(req({ pageContext: { path: `/student/dashboard${'x'.repeat(300)}`, classId: 'k1', junk: { deep: 'x'.repeat(5000) } } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ threadId: 't-new' });
    const stored = mocks.createThread.mock.calls[0][1].pageContext;
    expect(stored).toEqual({ path: `/student/dashboard${'x'.repeat(300)}`.slice(0, 200), classId: 'k1' });
  });

  it('stores nothing for a page context that is not one', async () => {
    await POST(req({ pageContext: 'drop table' }));
    await POST(req({ pageContext: { path: 42 } }));
    await POST(req({}));
    expect(mocks.createThread.mock.calls.map((c) => c[1].pageContext)).toEqual([null, null, null]);
  });

  it('never shows a raw database error (Ruling 26)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.createThread.mockRejectedValue(new Error('Assistant store: permission denied for table nexus_assistant_threads code=42501'));
    const res = await POST(req({}));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Something went wrong on my side. Please try again.' });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
