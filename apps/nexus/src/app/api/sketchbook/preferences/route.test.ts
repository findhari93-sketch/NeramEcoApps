import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ getRequestUser: vi.fn(), setFeatureOptOut: vi.fn(), setDrawingSharingOptOut: vi.fn() }));
vi.mock('@/lib/study-materials', () => ({ getRequestUser: (h: string | null) => m.getRequestUser(h) }));
vi.mock('@neram/database/queries/nexus', () => ({
  setFeatureOptOut: (...a: unknown[]) => m.setFeatureOptOut(...a),
  setDrawingSharingOptOut: (...a: unknown[]) => m.setDrawingSharingOptOut(...a),
}));

import { PATCH } from './route';

const patch = (body: unknown) =>
  new NextRequest('http://localhost/api/sketchbook/preferences', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('PATCH /api/sketchbook/preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getRequestUser.mockResolvedValue({ id: 's1', user_type: 'student' });
    m.setDrawingSharingOptOut.mockResolvedValue(true);
  });

  it('turns sharing to Inspiration off', async () => {
    const res = await PATCH(patch({ share_drawings_opt_out: true }));
    expect(res.status).toBe(200);
    expect(m.setDrawingSharingOptOut).toHaveBeenCalledWith('s1', true);
    expect(m.setFeatureOptOut).not.toHaveBeenCalled();
  });

  it('still saves the Teams feature opt-out', async () => {
    const res = await PATCH(patch({ feature_opt_out: false }));
    expect(res.status).toBe(200);
    expect(m.setFeatureOptOut).toHaveBeenCalledWith('s1', false);
  });

  it('refuses a body with neither preference', async () => {
    const res = await PATCH(patch({ other: 1 }));
    expect(res.status).toBe(400);
  });
});
