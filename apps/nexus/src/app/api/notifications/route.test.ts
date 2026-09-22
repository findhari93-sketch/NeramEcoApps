import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The bell poller must be able to tell "signed out" from "server trouble".
 *
 * This route answered 500 for a missing or bad token and 404 whenever the users
 * lookup failed (a timeout or dropped proxy connection leaves `data` null), which
 * is what production showed as 404s on /api/notifications?countOnly=true.
 */

const verifyMsToken = vi.fn();
const single = vi.fn();

vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: (...a: unknown[]) => verifyMsToken(...a) }));
vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single }) }) }) }),
  getUserUnreadNotificationCount: vi.fn(async () => 3),
  listUserNotifications: vi.fn(async () => ({ notifications: [], total: 0 })),
}));

import { GET } from './route';

const request = () =>
  new NextRequest('http://localhost/api/notifications?countOnly=true', { headers: { Authorization: 'Bearer t' } });

beforeEach(() => {
  verifyMsToken.mockReset();
  single.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/notifications status codes', () => {
  it('answers 401 for a missing or rejected token', async () => {
    verifyMsToken.mockRejectedValueOnce(new Error('Missing or invalid Authorization header'));
    expect((await GET(request())).status).toBe(401);
  });

  it('answers 500, not 404, when the users lookup fails', async () => {
    verifyMsToken.mockResolvedValueOnce({ oid: 'o1' });
    single.mockResolvedValueOnce({ data: null, error: { code: '57014', message: 'statement timeout' } });
    expect((await GET(request())).status).toBe(500);
  });

  it('answers 404 only when there is genuinely no users row', async () => {
    verifyMsToken.mockResolvedValueOnce({ oid: 'o1' });
    single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
    expect((await GET(request())).status).toBe(404);
  });

  it('returns the unread count', async () => {
    verifyMsToken.mockResolvedValueOnce({ oid: 'o1' });
    single.mockResolvedValueOnce({ data: { id: 'u1' }, error: null });
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 3 });
  });
});
