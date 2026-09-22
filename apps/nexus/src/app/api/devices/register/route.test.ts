import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * An impersonation token resolves as the student, so without a check here a
 * teacher's computer could take the student's empty device slot during View as
 * Student, and the student's own device then showed "Unregistered Device"
 * (PERF-0035).
 */

const verifyMsToken = vi.fn();
vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: (...a: unknown[]) => verifyMsToken(...a) }));

const registerDevice = vi.fn<unknown[], Promise<unknown>>(async () => ({ device: { id: 'dev-1' }, error: null, isLimitError: false }));
const incrementDeviceSessionCount = vi.fn<unknown[], Promise<void>>(async () => {});
vi.mock('@neram/database', () => ({
  registerDevice: (...a: unknown[]) => registerDevice(...a),
  incrementDeviceSessionCount: (...a: unknown[]) => incrementDeviceSessionCount(...a),
  getSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'stu-1' }, error: null }) }) }),
    }),
  }),
}));

import { POST } from './route';

const request = () =>
  new NextRequest('http://localhost/api/devices/register', {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fingerprint: 'fp-1', deviceCategory: 'desktop' }),
  });

beforeEach(() => {
  verifyMsToken.mockReset();
  registerDevice.mockClear();
  incrementDeviceSessionCount.mockClear();
});

describe('POST /api/devices/register', () => {
  it("registers a student's own device", async () => {
    verifyMsToken.mockResolvedValue({ oid: 'oid-stu' });
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(registerDevice).toHaveBeenCalledTimes(1);
  });

  it('registers nothing while a teacher views as the student', async () => {
    verifyMsToken.mockResolvedValue({ oid: 'oid-stu', impersonatorUserId: 'teacher-1' });
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ device: null });
    expect(registerDevice).not.toHaveBeenCalled();
    expect(incrementDeviceSessionCount).not.toHaveBeenCalled();
  });
});
