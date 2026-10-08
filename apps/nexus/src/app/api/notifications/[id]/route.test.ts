import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * What a Teams Activity click opens in the Assistant's tab: the caller's own
 * notification, never anyone else's, with the page it is about.
 */

const verifyMsToken = vi.fn();
const userSingle = vi.fn();
const rowMaybeSingle = vi.fn();
const markRead = vi.fn(async () => {});
const rowFilters: Array<[string, string]> = [];

vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: (...a: unknown[]) => verifyMsToken(...a) }));
vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: (col: string, val: string) => {
          if (table === 'user_notifications') rowFilters.push([col, val]);
          return chain;
        },
        single: () => userSingle(),
        maybeSingle: () => rowMaybeSingle(),
      };
      return chain;
    },
  }),
  markUserNotificationRead: (...a: unknown[]) => markRead(...(a as [])),
}));

import { GET } from './route';

const ID = '7f1c2a9e-3b4d-4c5e-8f60-1a2b3c4d5e6f';
const call = (id = ID) =>
  GET(new NextRequest(`http://localhost/api/notifications/${id}`, { headers: { Authorization: 'Bearer t' } }), {
    params: { id },
  });

const digestRow = {
  id: ID,
  event_type: 'catchup_digest',
  title: 'New reasons for missing class',
  message: '3 students explained why they missed a class.',
  metadata: {
    classroom_id: 'r1',
    items: [{ kind: 'reason', studentName: 'Asha', classTitle: 'Maths', scheduledDate: '2026-10-06', reasonLabel: 'Unwell', reasonNote: null }],
    more: 2,
    href: '/teacher/catch-up?view=calendar&month=2026-10&class=c1',
  },
  is_read: false,
  created_at: '2026-10-07T03:30:00Z',
};

beforeEach(() => {
  verifyMsToken.mockReset();
  userSingle.mockReset();
  rowMaybeSingle.mockReset();
  markRead.mockClear();
  rowFilters.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/notifications/:id', () => {
  it('answers 401 without a valid token', async () => {
    verifyMsToken.mockRejectedValueOnce(new Error('Missing or invalid Authorization header'));
    expect((await call()).status).toBe(401);
  });

  it('returns the caller’s own notification with its details and page, and marks it read', async () => {
    verifyMsToken.mockResolvedValueOnce({ oid: 'o1' });
    userSingle.mockResolvedValueOnce({ data: { id: 'u1', user_type: 'teacher', staff_role: null }, error: null });
    rowMaybeSingle.mockResolvedValueOnce({ data: digestRow, error: null });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await res.json();
    expect(body).toMatchObject({
      id: ID,
      title: 'New reasons for missing class',
      more: 2,
      href: '/teacher/catch-up?view=calendar&month=2026-10&class=c1',
    });
    expect(body.items).toHaveLength(1);
    expect(rowFilters).toContainEqual(['user_id', 'u1']);
    expect(markRead).toHaveBeenCalledWith(ID, 'u1', expect.anything());
  });

  it('routes by role when the row names no page', async () => {
    verifyMsToken.mockResolvedValueOnce({ oid: 'o1' });
    userSingle.mockResolvedValueOnce({ data: { id: 'u1', user_type: 'student', staff_role: null }, error: null });
    rowMaybeSingle.mockResolvedValueOnce({
      data: { ...digestRow, event_type: 'assignment_reviewed', metadata: { assignment_id: 'a1' }, is_read: true },
      error: null,
    });
    const body = await (await call()).json();
    expect(body.href).toBe('/student/assignments/a1');
    expect(body.items).toEqual([]);
    expect(markRead).not.toHaveBeenCalled();
  });

  it('answers 404 for someone else’s notification, the same as a missing one', async () => {
    verifyMsToken.mockResolvedValueOnce({ oid: 'o1' });
    userSingle.mockResolvedValueOnce({ data: { id: 'u1' }, error: null });
    rowMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect((await call()).status).toBe(404);
  });

  it('answers 404 for an id that is not a uuid, without querying', async () => {
    verifyMsToken.mockResolvedValueOnce({ oid: 'o1' });
    expect((await call('not-an-id')).status).toBe(404);
    expect(userSingle).not.toHaveBeenCalled();
  });
});
