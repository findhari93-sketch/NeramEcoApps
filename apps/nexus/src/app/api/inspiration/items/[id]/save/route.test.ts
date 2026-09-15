import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-errors';
import { makeRow } from '@/lib/inspiration-test-rows';

const mocks = vi.hoisted(() => ({
  resolveCaller: vi.fn(),
  getInspirationItem: vi.fn(),
  setInspirationSave: vi.fn(),
}));

vi.mock('@/lib/inspiration-access', () => ({
  resolveInspirationCaller: (h: string | null) => mocks.resolveCaller(h),
  parseItemId: (raw: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(raw)) {
      throw new ApiError('Drawing not found', 404);
    }
    return raw;
  },
}));
vi.mock('@neram/database/queries/nexus', () => ({
  getInspirationItem: (...a: unknown[]) => mocks.getInspirationItem(...a),
  setInspirationSave: (...a: unknown[]) => mocks.setInspirationSave(...a),
}));

import { POST, DELETE } from './route';

const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const request = () =>
  new NextRequest(`http://localhost/api/inspiration/items/${id}/save`, {
    headers: { Authorization: 'Bearer token' },
  });

describe('POST/DELETE /api/inspiration/items/[id]/save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getInspirationItem.mockResolvedValue({ item: makeRow() });
    mocks.setInspirationSave.mockResolvedValue(undefined);
  });

  describe('POST', () => {
    it('student POST on an item outside their scope: 404, setInspirationSave not called', async () => {
      mocks.resolveCaller.mockResolvedValue({ user: { id: 's1' }, staff: false });
      mocks.getInspirationItem.mockResolvedValue({ item: null });
      const res = await POST(request(), { params: { id } });
      expect(res.status).toBe(404);
      expect(mocks.getInspirationItem).toHaveBeenCalledWith(id, 's1', 'visible');
      expect(mocks.setInspirationSave).not.toHaveBeenCalled();
    });

    it('student POST on a visible item: 200, body { saved: true }', async () => {
      mocks.resolveCaller.mockResolvedValue({ user: { id: 's1' }, staff: false });
      const res = await POST(request(), { params: { id } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ saved: true });
      expect(mocks.setInspirationSave).toHaveBeenCalledWith(id, 's1', true);
    });

    it('staff POST: getInspirationItem called with scope all', async () => {
      mocks.resolveCaller.mockResolvedValue({ user: { id: 't1' }, staff: true });
      const res = await POST(request(), { params: { id } });
      expect(res.status).toBe(200);
      expect(mocks.getInspirationItem).toHaveBeenCalledWith(id, 't1', 'all');
      expect(mocks.setInspirationSave).toHaveBeenCalledWith(id, 't1', true);
    });

    it('POST with id not-a-uuid: 404, nothing written', async () => {
      mocks.resolveCaller.mockResolvedValue({ user: { id: 's1' }, staff: false });
      const badReq = () =>
        new NextRequest(`http://localhost/api/inspiration/items/not-a-uuid/save`, {
          headers: { Authorization: 'Bearer token' },
        });
      const res = await POST(badReq(), { params: { id: 'not-a-uuid' } });
      expect(res.status).toBe(404);
      expect(mocks.getInspirationItem).not.toHaveBeenCalled();
      expect(mocks.setInspirationSave).not.toHaveBeenCalled();
    });
  });

  describe('DELETE', () => {
    it('student DELETE on an item that is now hidden: 200, body { saved: false }, no getInspirationItem', async () => {
      mocks.resolveCaller.mockResolvedValue({ user: { id: 's1' }, staff: false });
      const res = await DELETE(request(), { params: { id } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ saved: false });
      expect(mocks.getInspirationItem).not.toHaveBeenCalled();
      expect(mocks.setInspirationSave).toHaveBeenCalledWith(id, 's1', false);
    });
  });
});
