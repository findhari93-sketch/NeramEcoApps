// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const resolveMedia = vi.fn();
const evictMedia = vi.fn();
vi.mock('@/lib/recording-source-cache', () => ({
  resolveMedia: (...a: unknown[]) => resolveMedia(...a),
  evictMedia: (...a: unknown[]) => evictMedia(...a),
}));

import { GET } from './route';
import { mintVideoToken } from '@/lib/video-token';

const VIDEO_SECRET = 'video-secret';
const PROXY_SECRET = 'proxy-secret-value';

function request(vt: string | null, secret?: string, extra = '') {
  const url = `http://localhost/api/media/recording/source${vt ? `?vt=${encodeURIComponent(vt)}${extra}` : ''}`;
  return new NextRequest(url, { headers: secret === undefined ? {} : { 'x-media-proxy-secret': secret } });
}

const grant = () => mintVideoToken({ scope: 'class', refId: 'class-1', userId: 'u-1', size: 1000 }).token;

beforeEach(() => {
  process.env.VIDEO_STREAM_SECRET = VIDEO_SECRET;
  process.env.MEDIA_PROXY_SECRET = PROXY_SECRET;
  resolveMedia.mockReset();
  evictMedia.mockReset();
  resolveMedia.mockResolvedValue({ downloadUrl: 'https://sp/dl', size: 1000, mime: 'video/mp4', itemId: 'i' });
});

afterEach(() => {
  delete process.env.VIDEO_STREAM_SECRET;
  delete process.env.MEDIA_PROXY_SECRET;
});

describe('GET /api/media/recording/source', () => {
  it('401s without the proxy secret header', async () => {
    const res = await GET(request(grant()));
    expect(res.status).toBe(401);
    expect(resolveMedia).not.toHaveBeenCalled();
  });

  it('401s with a wrong proxy secret', async () => {
    const res = await GET(request(grant(), 'nope'));
    expect(res.status).toBe(401);
    expect(resolveMedia).not.toHaveBeenCalled();
  });

  it('401s when MEDIA_PROXY_SECRET is not configured, even if the header is empty', async () => {
    delete process.env.MEDIA_PROXY_SECRET;
    const res = await GET(request(grant(), ''));
    expect(res.status).toBe(401);
  });

  it('401s for a bad grant even with the right secret', async () => {
    const res = await GET(request('vid_forged.sig', PROXY_SECRET));
    expect(res.status).toBe(401);
    expect(resolveMedia).not.toHaveBeenCalled();
  });

  it('returns the source and never caches it', async () => {
    const res = await GET(request(grant(), PROXY_SECRET));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ downloadUrl: 'https://sp/dl', mime: 'video/mp4', size: 1000 });
    expect(resolveMedia).toHaveBeenCalledWith('class', 'class-1');
    expect(evictMedia).not.toHaveBeenCalled();
  });

  it('evicts first when asked', async () => {
    await GET(request(grant(), PROXY_SECRET, '&evict=1'));
    expect(evictMedia).toHaveBeenCalledWith('class', 'class-1');
  });

  it('404s for a missing recording', async () => {
    resolveMedia.mockRejectedValue(new Error('MEDIA_NOT_FOUND'));
    const res = await GET(request(grant(), PROXY_SECRET));
    expect(res.status).toBe(404);
  });

  it('409s when the size is unknown', async () => {
    resolveMedia.mockRejectedValue(new Error('RECORDING_SIZE_UNKNOWN'));
    const res = await GET(request(grant(), PROXY_SECRET));
    expect(res.status).toBe(409);
  });
});
