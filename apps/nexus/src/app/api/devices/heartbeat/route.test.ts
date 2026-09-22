import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * An impersonation token resolves as the student, so without a check here a
 * teacher's View as Student session was logged as the student's own active time
 * (PERF-0035). /api/auth/me already writes nothing while impersonating; this
 * route now does the same.
 */

const verifyMsToken = vi.fn();
vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: (...a: unknown[]) => verifyMsToken(...a) }));

const recordDeviceHeartbeat = vi.fn<unknown[], Promise<void>>(async () => {});
vi.mock('@neram/database', () => ({
  recordDeviceHeartbeat: (...a: unknown[]) => recordDeviceHeartbeat(...a),
  getSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'stu-1' }, error: null }) }) }),
    }),
  }),
}));

import { POST } from './route';

const request = () =>
  new NextRequest('http://localhost/api/devices/heartbeat', {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: 'dev-1', activeSeconds: 30, idleSeconds: 0 }),
  });

beforeEach(() => {
  verifyMsToken.mockReset();
  recordDeviceHeartbeat.mockClear();
});

describe('POST /api/devices/heartbeat', () => {
  it("records a student's own heartbeat", async () => {
    verifyMsToken.mockResolvedValue({ oid: 'oid-stu' });
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(recordDeviceHeartbeat).toHaveBeenCalledTimes(1);
  });

  it('writes nothing while a teacher views as the student', async () => {
    verifyMsToken.mockResolvedValue({ oid: 'oid-stu', impersonatorUserId: 'teacher-1' });
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(recordDeviceHeartbeat).not.toHaveBeenCalled();
  });

  it('answers a Microsoft outage as 503, not as a bad token', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ApiError } = await import('@/lib/api-errors');
    verifyMsToken.mockRejectedValue(new ApiError('Microsoft sign-in check is unavailable. Try again.', 503));
    const res = await POST(request());
    expect(res.status).toBe(503);
  });
});
