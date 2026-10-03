// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRequestUser: vi.fn(),
  verifyMsToken: vi.fn(),
  assertAssistantAccess: vi.fn(),
  loadBriefFacts: vi.fn(),
}));

vi.mock('@/lib/study-materials', () => ({ getRequestUser: mocks.getRequestUser }));
vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: mocks.verifyMsToken }));
vi.mock('@/lib/assistant/access', () => ({ assertAssistantAccess: mocks.assertAssistantAccess }));
vi.mock('@/lib/assistant/brief-load', () => ({ loadBriefFacts: mocks.loadBriefFacts, istHour: () => 9 }));
vi.mock('@neram/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@neram/database')>()),
  getSupabaseAdminClient: () => ({}),
}));

import * as route from './route';
import { GET } from './route';
import { ApiError } from '@/lib/api-errors';

const req = () => new NextRequest('http://localhost/api/assistant/brief', { headers: { Authorization: 'Bearer t' } });

beforeEach(() => {
  mocks.verifyMsToken.mockReset().mockResolvedValue({ oid: 'oid-1' });
  mocks.getRequestUser.mockReset().mockResolvedValue({ id: 'u1', user_type: 'student', name: 'Priya S', staff_role: null, can_teach: null });
  mocks.assertAssistantAccess.mockReset().mockResolvedValue({ sketchbook: false, attendance: true });
  mocks.loadBriefFacts.mockReset().mockResolvedValue({
    firstName: 'Priya', today: '2026-10-03', classroomName: 'JEE', nextClass: null,
    assignments: { pending: 1, nextTitle: 'Sheet', nextDueOn: null }, catchup: null, reviewsBack: 0, sketchbookLine: null, exam: null, remindersToday: [],
  });
});

describe('GET /api/assistant/brief', () => {
  it('returns the built brief for the signed-in student', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brief.greeting).toBe('Good morning, Priya');
    expect(body.brief.sections[0].id).toBe('assignments');
    // The gate's features reach the loader, so a hidden sketchbook has no line (Ruling 25).
    expect(mocks.loadBriefFacts).toHaveBeenCalledWith(expect.anything(), 'u1', expect.any(Date), { sketchbook: false, attendance: true });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('passes the gate\'s status through (404 while dark, 403 outside the pilot)', async () => {
    mocks.assertAssistantAccess.mockRejectedValueOnce(new ApiError('Not found', 404));
    expect((await GET(req())).status).toBe(404);
    mocks.assertAssistantAccess.mockRejectedValueOnce(new ApiError('no', 403));
    expect((await GET(req())).status).toBe(403);
  });

  it('answers 401 when the token is bad', async () => {
    mocks.verifyMsToken.mockRejectedValueOnce(new Error('Invalid Microsoft token'));
    expect((await GET(req())).status).toBe(401);
  });

  it('keeps the uncached Graph /me fetch out of the Data Cache (GET-only route)', () => {
    expect(route.fetchCache).toBe('force-no-store');
  });

  it('never shows a raw loader error: logs it and answers 500 with a fixed sentence (Ruling 26)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.loadBriefFacts.mockRejectedValueOnce(new Error('column users.name does not exist'));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Something went wrong on my side. Please try again.' });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
