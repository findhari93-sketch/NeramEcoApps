import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRow } from '@/lib/inspiration-test-rows';

const ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  resolveCaller: vi.fn(),
  getInspirationItem: vi.fn(),
  getSimilarInspiration: vi.fn(),
  updateInspirationItem: vi.fn(),
  hideInspirationByAuthor: vi.fn(),
  deleteExemplar: vi.fn(),
}));

vi.mock('@/lib/inspiration-access', async () => {
  const { ApiError } = await import('@/lib/api-errors');
  return {
    resolveInspirationCaller: (h: string | null) => mocks.resolveCaller(h),
    assertInspirationStaff: (c: { staff: boolean }) => {
      if (!c.staff) throw new ApiError('Only teachers can change Inspiration.', 403);
    },
    parseItemId: (raw: string) => {
      if (!/^[0-9a-f-]{36}$/i.test(raw)) throw new ApiError('Drawing not found', 404);
      return raw;
    },
  };
});
vi.mock('@neram/database/queries/nexus', () => ({
  getInspirationItem: (...a: unknown[]) => mocks.getInspirationItem(...a),
  getSimilarInspiration: (...a: unknown[]) => mocks.getSimilarInspiration(...a),
  updateInspirationItem: (...a: unknown[]) => mocks.updateInspirationItem(...a),
  hideInspirationByAuthor: (...a: unknown[]) => mocks.hideInspirationByAuthor(...a),
  deleteExemplar: (...a: unknown[]) => mocks.deleteExemplar(...a),
}));

import { DELETE, GET, PATCH } from './route';

const ctx = { params: { id: ID } };
const get = () => new NextRequest(`http://localhost/api/inspiration/items/${ID}`, { headers: { Authorization: 'Bearer t' } });
const patch = (body: unknown) =>
  new NextRequest(`http://localhost/api/inspiration/items/${ID}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const student = { user: { id: 's1' }, staff: false };
const teacher = { user: { id: 't1' }, staff: true };

describe('/api/inspiration/items/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSimilarInspiration.mockResolvedValue([]);
    mocks.getInspirationItem.mockResolvedValue({ item: makeRow(), pair: makeRow({ id: 'pair', source_kind: 'submission_reference' }) });
  });

  it('asks for the visible scope for a student and answers 404 when the item is hidden', async () => {
    mocks.resolveCaller.mockResolvedValue(student);
    mocks.getInspirationItem.mockResolvedValue({ item: null, pair: null });
    const res = await GET(get(), ctx);
    expect(mocks.getInspirationItem).toHaveBeenCalledWith(ID, 's1', 'visible');
    expect(res.status).toBe(404);
  });

  it('gives staff every scope and the teacher block', async () => {
    mocks.resolveCaller.mockResolvedValue(teacher);
    const body = await (await GET(get(), ctx)).json();
    expect(mocks.getInspirationItem).toHaveBeenCalledWith(ID, 't1', 'all');
    expect(body.item.staff).toBeDefined();
    expect(body.pair.badge).toBe('reference');
  });

  it('refuses edits from a student', async () => {
    mocks.resolveCaller.mockResolvedValue(student);
    const res = await PATCH(patch({ curation: 'hidden' }), ctx);
    expect(res.status).toBe(403);
    expect(mocks.updateInspirationItem).not.toHaveBeenCalled();
  });

  it('hides a drawing for a teacher', async () => {
    mocks.resolveCaller.mockResolvedValue(teacher);
    const res = await PATCH(patch({ curation: 'hidden' }), ctx);
    expect(res.status).toBe(200);
    expect(mocks.updateInspirationItem).toHaveBeenCalledWith(ID, { curation: 'hidden' }, 't1');
  });

  it("keeps a student drawing's types tied to its review", async () => {
    mocks.resolveCaller.mockResolvedValue(teacher);
    const res = await PATCH(patch({ type_slugs: ['still_life'] }), ctx);
    expect(res.status).toBe(400);
    expect(mocks.updateInspirationItem).not.toHaveBeenCalled();
  });

  it('refuses hide-all when the drawing has no student, and changes nothing', async () => {
    mocks.resolveCaller.mockResolvedValue(teacher);
    mocks.getInspirationItem.mockResolvedValue({ item: makeRow({ author_id: null }), pair: null });
    const res = await PATCH(patch({ curation: 'shown', hide_all_by_author: true }), ctx);
    expect(res.status).toBe(400);
    expect(mocks.updateInspirationItem).not.toHaveBeenCalled();
    expect(mocks.hideInspirationByAuthor).not.toHaveBeenCalled();
  });

  it('deletes only exemplars', async () => {
    mocks.resolveCaller.mockResolvedValue(teacher);
    mocks.deleteExemplar.mockResolvedValue(false);
    const res = await DELETE(get(), ctx);
    expect(res.status).toBe(400);
  });
});
