// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  caller: vi.fn(),
  meta: vi.fn(),
  list: vi.fn(),
  upload: vi.fn(),
  bucket: vi.fn(),
}));

vi.mock('@/lib/pad/caller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/caller')>()),
  resolvePadCaller: mocks.caller,
}));
vi.mock('@/lib/pad/sessions', () => ({
  loadSessionMeta: mocks.meta,
  padDb: () => ({
    storage: {
      from: (bucket: string) => {
        mocks.bucket(bucket);
        return {
          list: mocks.list,
          upload: mocks.upload,
          getPublicUrl: (path: string) => ({ data: { publicUrl: `https://zdnypksjqnhtiblwdaic.supabase.co/storage/v1/object/public/uploads/${path}` } }),
        };
      },
    },
  }),
}));
vi.mock('@neram/database', () => ({ rewriteStorageUrl: (url: string) => url.replace('https://zdnypksjqnhtiblwdaic.supabase.co', 'https://db.neramclasses.com') }));

import { POST } from './route';

const SESSION = '11111111-1111-4111-8111-111111111111';
const TEACHER = { user: { id: 'teacher-1' }, role: 'staff', internal: false };

function call(file: File | null, id = SESSION) {
  const form = new FormData();
  if (file) form.append('file', file);
  return POST(
    new NextRequest(`http://localhost:3022/api/pad/sessions/${id}/image`, { method: 'POST', headers: { Authorization: 'Bearer token' }, body: form }),
    { params: { id } },
  );
}

const png = (bytes = 2048) => new File([new Uint8Array(bytes)], 'image.png', { type: 'image/png' });

beforeEach(() => {
  mocks.caller.mockReset().mockResolvedValue(TEACHER);
  mocks.meta.mockReset().mockResolvedValue({ id: SESSION, classroom_id: 'c1', batch_id: null, teacher_id: 'teacher-1', status: 'live' });
  mocks.list.mockReset().mockResolvedValue({ data: [], error: null });
  mocks.upload.mockReset().mockResolvedValue({ data: {}, error: null });
  mocks.bucket.mockReset();
});

describe('POST /api/pad/sessions/:id/image', () => {
  it("stores a pasted picture in this session's folder and answers its public address through the proxy", async () => {
    const response = await call(png());
    expect(response.status).toBe(200);
    const { url } = await response.json();

    expect(mocks.bucket).toHaveBeenCalledWith('uploads');
    const [path, , options] = mocks.upload.mock.calls[0];
    expect(path).toMatch(new RegExp(`^pad/${SESSION}/[0-9a-f-]{36}\\.png$`));
    expect(options).toMatchObject({ contentType: 'image/png', upsert: false });
    expect(url).toBe(`https://db.neramclasses.com/storage/v1/object/public/uploads/${path}`);
  });

  it('refuses a missing file, a type that is not a picture, and anything over 10 MB', async () => {
    expect((await call(null)).status).toBe(400);
    expect((await call(new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }))).status).toBe(400);
    expect((await call(png(10 * 1024 * 1024 + 1))).status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("refuses another teacher's class, an ended class, and a student", async () => {
    mocks.caller.mockResolvedValue({ ...TEACHER, user: { id: 'teacher-2' } });
    expect((await call(png())).status).toBe(403);

    mocks.caller.mockResolvedValue(TEACHER);
    mocks.meta.mockResolvedValue({ id: SESSION, classroom_id: 'c1', batch_id: null, teacher_id: 'teacher-1', status: 'ended' });
    expect((await call(png())).status).toBe(409);

    mocks.caller.mockResolvedValue({ user: { id: 'student-1' }, role: 'student', internal: false });
    expect((await call(png())).status).toBe(403);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('stops at sixty pictures in one class', async () => {
    mocks.list.mockResolvedValue({ data: Array.from({ length: 60 }, (_, i) => ({ name: `${i}.png` })), error: null });
    expect((await call(png())).status).toBe(429);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
