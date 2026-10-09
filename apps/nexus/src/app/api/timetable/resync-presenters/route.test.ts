import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * POST /api/timetable/resync-presenters makes staff presenters on meetings that
 * already exist. What this pins: admin only, only upcoming classes that ask for
 * staff presenters, one PATCH per shared meeting, the organizer's meeting (not
 * the caller's), and a refused PATCH reported as a failure, never a success.
 */

const getRequestUser = vi.fn();
const assertCapability = vi.fn();
const applyMeetingOptions = vi.fn();
const findOnlineMeetingId = vi.fn();
const tables: Record<string, unknown[]> = {};

function table(name: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'in', 'gte', 'order', 'eq']) b[m] = () => b;
  b.then = (resolve: (v: unknown) => void) => resolve({ data: tables[name] ?? [], error: null });
  return b;
}

vi.mock('@/lib/study-materials', () => ({
  getRequestUser: (...a: unknown[]) => getRequestUser(...a),
  assertCapability: (...a: unknown[]) => assertCapability(...a),
}));
vi.mock('@neram/database', () => ({ getSupabaseAdminClient: () => ({ from: (name: string) => table(name) }) }));
vi.mock('@/lib/graph-app-token', () => ({ getAppOnlyToken: async () => 'app-token' }));
vi.mock('@/lib/meeting-options', () => ({
  applyMeetingOptions: (...a: unknown[]) => applyMeetingOptions(...a),
  findOnlineMeetingId: (...a: unknown[]) => findOnlineMeetingId(...a),
}));

import { POST } from './route';

const future = '2999-01-01';
const cls = (over: Record<string, unknown>) => ({
  id: 'c1',
  title: 'Class',
  scheduled_date: future,
  status: 'scheduled',
  allowed_presenters: 'roleIsPresenter',
  online_meeting_id: 'MSo1',
  organizer_ms_oid: 'oid-tamil',
  teams_meeting_join_url: 'https://teams/join/1',
  teams_meeting_url: null,
  ...over,
});

function post(body: unknown) {
  return new NextRequest('http://localhost/api/timetable/resync-presenters', {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getRequestUser.mockReset().mockResolvedValue({ id: 'admin' });
  assertCapability.mockReset();
  applyMeetingOptions.mockReset().mockResolvedValue({ presenters: true, record: false, status: 200 });
  findOnlineMeetingId.mockReset().mockResolvedValue(null);
  tables.users = [
    { name: 'Hari Babu', email: 'Haribabu@neramclasses.com', ms_oid: 'oid-hari', user_type: 'admin' },
    { name: 'Tamil Selvan', email: 'TamilSelvan@neramclasses.com', ms_oid: 'oid-tamil', user_type: 'admin' },
  ];
  tables.nexus_scheduled_classes = [];
});

describe('POST /api/timetable/resync-presenters', () => {
  it('is admin only', async () => {
    const { ApiError } = await import('@/lib/api-errors');
    assertCapability.mockImplementation(() => {
      throw new ApiError('Not authorized: this action requires system.settings.', 403);
    });
    const res = await POST(post({ dryRun: true }));
    expect(res.status).toBe(403);
    expect(applyMeetingOptions).not.toHaveBeenCalled();
  });

  it('dry run picks upcoming staff-presenter classes, once per meeting, without calling Graph', async () => {
    tables.nexus_scheduled_classes = [
      cls({ id: 'a' }),
      cls({ id: 'b' }), // same meeting, another classroom
      cls({ id: 'c', allowed_presenters: 'organizer', teams_meeting_join_url: 'https://teams/join/2' }),
      cls({ id: 'd', status: 'cancelled', teams_meeting_join_url: 'https://teams/join/3' }),
      cls({ id: 'e', teams_meeting_join_url: null }),
      cls({ id: 'f', allowed_presenters: null, teams_meeting_join_url: 'https://teams/join/4' }),
    ];
    const body = await (await POST(post({ dryRun: true }))).json();
    expect(body.updated.map((u: { id: string }) => u.id)).toEqual(['a', 'f']);
    expect(body.skipped.map((s: { id: string }) => s.id)).toEqual(['b']);
    expect(body.presenters).toBe(2);
    expect(applyMeetingOptions).not.toHaveBeenCalled();
  });

  it("sets staff presenters on the organizer's meeting with the app-only token", async () => {
    tables.nexus_scheduled_classes = [cls({})];
    const body = await (await POST(post({}))).json();
    expect(body.summary).toEqual({ updated: 1, skipped: 0, failed: 0 });
    const [token, owner, meetingId, options] = applyMeetingOptions.mock.calls[0];
    expect(token).toBe('app-token');
    expect(owner).toEqual({ kind: 'user', oid: 'oid-tamil' });
    expect(meetingId).toBe('MSo1');
    expect(options.allowedPresenters).toBe('roleIsPresenter');
    expect(options.presenters.map((p: { oid: string }) => p.oid)).toEqual(['oid-hari', 'oid-tamil']);
  });

  it('reports a refused PATCH as failed, and a meeting Teams cannot find as skipped', async () => {
    tables.nexus_scheduled_classes = [
      cls({ id: 'a' }),
      cls({ id: 'b', online_meeting_id: null, teams_meeting_join_url: 'https://teams/join/2' }),
    ];
    applyMeetingOptions.mockResolvedValue({ presenters: false, record: false, status: 400, presentersFallback: true });
    const body = await (await POST(post({}))).json();
    expect(body.failed).toEqual([{ id: 'a', title: 'Class', date: future, error: 'Graph 400, left at organizer-only' }]);
    expect(body.skipped.map((s: { id: string }) => s.id)).toEqual(['b']);
  });
});
