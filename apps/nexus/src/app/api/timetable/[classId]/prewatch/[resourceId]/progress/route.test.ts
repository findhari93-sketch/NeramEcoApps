import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The heartbeat hands everything to the nexus_bump_class_video_view RPC, which
 * owns the rules (attachment on this class, enrolment, cap, 80 percent). What
 * this pins: the RPC gets the student, the class, the attachment and clean
 * integers, and staff checking a video are never recorded as a watch.
 */

const rpc = vi.fn();
let user: Record<string, unknown> | null = null;

vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: async () => ({ oid: 'oid-1' }) }));
vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => b;
      b.maybeSingle = async () => ({ data: user, error: null });
      return b;
    },
    rpc: (...a: unknown[]) => rpc(...a),
  }),
}));

import { POST } from './route';

const call = (body: unknown) =>
  POST(
    new NextRequest('http://localhost/api/timetable/cls-1/prewatch/res-1/progress', {
      method: 'POST',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: { classId: 'cls-1', resourceId: 'res-1' } },
  );

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ error: null });
  user = { id: 'stu-1', user_type: 'student', staff_role: null, can_teach: false };
});

describe('POST prewatch progress', () => {
  it('bumps the view through the RPC with clean integers', async () => {
    const res = await call({ last_video_position_seconds: 95.6, watched_delta_seconds: 30.2, duration_seconds: -5 });
    expect(await res.json()).toEqual({ ok: true, recorded: true });
    expect(rpc).toHaveBeenCalledWith('nexus_bump_class_video_view', {
      p_student: 'stu-1',
      p_class: 'cls-1',
      p_resource: 'res-1',
      p_pos: 96,
      p_watched_delta: 30,
      p_duration: 0,
    });
  });

  it('does not record staff', async () => {
    user = { id: 't-1', user_type: 'teacher', staff_role: 'teacher', can_teach: true };
    expect(await (await call({ watched_delta_seconds: 30 })).json()).toEqual({ ok: true, recorded: false });
    expect(rpc).not.toHaveBeenCalled();
  });
});
