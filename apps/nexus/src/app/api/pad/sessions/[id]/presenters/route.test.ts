// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ caller: vi.fn(), meta: vi.fn(), check: vi.fn() }));

vi.mock('@/lib/pad/caller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/caller')>()),
  resolvePadCaller: mocks.caller,
}));
vi.mock('@/lib/pad/sessions', () => ({ loadSessionMeta: mocks.meta }));
vi.mock('@/lib/pad/meeting-presenters', () => ({ checkSessionPresenters: mocks.check }));

import { GET, POST } from './route';

const SESSION = '11111111-1111-4111-8111-111111111111';
const req = (method: string) =>
  new NextRequest(`http://localhost/api/pad/sessions/${SESSION}/presenters`, { method, headers: { Authorization: 'Bearer t' } });

beforeEach(() => {
  mocks.caller.mockReset().mockResolvedValue({ user: { id: 'teacher-1' }, role: 'staff', internal: false });
  mocks.meta.mockReset().mockResolvedValue({ id: SESSION, teacher_id: 'teacher-1', status: 'live' });
  mocks.check.mockReset().mockResolvedValue({ state: 'open', allowedPresenters: 'everyone', canFix: true });
});

describe('/api/pad/sessions/:id/presenters', () => {
  it('reads who may present for the session teacher', async () => {
    const res = await GET(req('GET'), { params: { id: SESSION } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: 'open', allowedPresenters: 'everyone', canFix: true });
    expect(mocks.check).toHaveBeenCalledWith(SESSION);
  });

  it('locks presenting on POST', async () => {
    mocks.check.mockResolvedValue({ state: 'locked', allowedPresenters: 'organizer', canFix: true });
    const res = await POST(req('POST'), { params: { id: SESSION } });
    expect(await res.json()).toMatchObject({ state: 'locked' });
    expect(mocks.check).toHaveBeenCalledWith(SESSION, { lock: true });
  });

  it('refuses another teacher', async () => {
    mocks.meta.mockResolvedValue({ id: SESSION, teacher_id: 'someone-else', status: 'live' });
    const res = await POST(req('POST'), { params: { id: SESSION } });
    expect(res.status).toBe(403);
    expect(mocks.check).not.toHaveBeenCalled();
  });

  it('refuses a student', async () => {
    mocks.caller.mockResolvedValue({ user: { id: 's1' }, role: 'student', internal: false });
    const res = await GET(req('GET'), { params: { id: SESSION } });
    expect(res.status).toBe(403);
  });
});
