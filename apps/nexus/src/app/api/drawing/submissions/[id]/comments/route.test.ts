import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  verifyMsToken: vi.fn(),
  rows: {} as Record<string, unknown>,
  listComments: vi.fn(),
  addComment: vi.fn(),
}));

vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: (h: string | null) => m.verifyMsToken(h) }));
vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: m.rows[table] ?? null, error: null }),
          maybeSingle: async () => ({ data: m.rows[table] ?? null, error: null }),
        }),
      }),
    }),
  }),
}));
vi.mock('@neram/database/queries/nexus', () => ({
  getDrawingSubmissionComments: (...a: unknown[]) => m.listComments(...a),
  addDrawingSubmissionComment: (...a: unknown[]) => m.addComment(...a),
}));

import { GET, POST } from './route';

const ctx = { params: Promise.resolve({ id: 'd1' }) };
const read = () =>
  new NextRequest('http://localhost/api/drawing/submissions/d1/comments', {
    headers: { Authorization: 'Bearer t' },
  });
const write = (text = 'nice work') =>
  new NextRequest('http://localhost/api/drawing/submissions/d1/comments', {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment_text: text }),
  });

/** The drawing belongs to `owner`. */
function viewerIs(id: string, user_type: string) {
  m.rows.users = { id, user_type };
}

describe('/api/drawing/submissions/[id]/comments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.verifyMsToken.mockResolvedValue({ oid: 'oid-1' });
    m.rows = { drawing_submissions: { id: 'd1', student_id: 'owner' } };
    m.listComments.mockResolvedValue([{ id: 'c1', comment_text: 'hello' }]);
    m.addComment.mockResolvedValue({ id: 'c2', comment_text: 'nice work' });
  });

  it('refuses a classmate reading another student thread', async () => {
    viewerIs('peer', 'student');
    const res = await GET(read(), ctx);
    expect(res.status).toBe(404);
    expect(m.listComments).not.toHaveBeenCalled();
  });

  it('refuses a classmate appending to another student thread', async () => {
    viewerIs('peer', 'student');
    const res = await POST(write(), ctx);
    expect(res.status).toBe(404);
    expect(m.addComment).not.toHaveBeenCalled();
  });

  it('lets the student who drew it read their own thread', async () => {
    viewerIs('owner', 'student');
    const res = await GET(read(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ comments: [{ id: 'c1', comment_text: 'hello' }] });
  });

  it('lets the student who drew it answer in their own thread', async () => {
    viewerIs('owner', 'student');
    const res = await POST(write(), ctx);
    expect(res.status).toBe(201);
    expect(m.addComment).toHaveBeenCalledWith(
      expect.objectContaining({ submission_id: 'd1', author_id: 'owner', author_role: 'student' }),
    );
  });

  it('lets a teacher read and write the thread', async () => {
    viewerIs('t1', 'teacher');
    expect((await GET(read(), ctx)).status).toBe(200);
    const res = await POST(write(), ctx);
    expect(res.status).toBe(201);
    expect(m.addComment).toHaveBeenCalledWith(expect.objectContaining({ author_role: 'teacher' }));
  });

  it('answers a missing drawing with 404', async () => {
    viewerIs('owner', 'student');
    m.rows.drawing_submissions = null;
    expect((await GET(read(), ctx)).status).toBe(404);
    expect((await POST(write(), ctx)).status).toBe(404);
  });

  it('answers an expired sign-in with 401, not 500', async () => {
    m.verifyMsToken.mockRejectedValue(new Error('Invalid Microsoft token'));
    expect((await GET(read(), ctx)).status).toBe(401);
    expect((await POST(write(), ctx)).status).toBe(401);
  });

  it('still rejects an empty comment', async () => {
    viewerIs('owner', 'student');
    const res = await POST(write('   '), ctx);
    expect(res.status).toBe(400);
    expect(m.addComment).not.toHaveBeenCalled();
  });
});
