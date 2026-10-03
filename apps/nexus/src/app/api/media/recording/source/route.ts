import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { verifyVideoToken } from '@/lib/video-token';
import { resolveMedia, evictMedia } from '@/lib/recording-source-cache';

/**
 * GET /api/media/recording/source?vt=vid_...[&evict=1]
 *
 * Server-to-server only. The Cloudflare media Worker (cloudflare/media-proxy)
 * calls this on a cache miss to learn where a recording's bytes live, so the
 * Microsoft Graph credentials and resolver stay inside Nexus. The Worker then
 * streams the bytes itself, which is what keeps video off Vercel's bandwidth.
 *
 * Two locks, both required:
 *   1. x-media-proxy-secret must equal MEDIA_PROXY_SECRET (compared in constant
 *      time). This is what stops a student calling it to learn a raw SharePoint
 *      URL.
 *   2. The vt grant must be valid, the same check the byte route makes, so the
 *      Worker can only resolve what a viewer was actually granted.
 *
 * ?evict=1 drops the cached resolution first: the Worker sends it after
 * SharePoint answered 403/404/410 for an expired pre-authenticated URL.
 */

export const runtime = 'nodejs';

function deny(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Constant time, and length independent because both sides are hashed first. */
function secretMatches(provided: string | null): boolean {
  const expected = process.env.MEDIA_PROXY_SECRET;
  if (!expected || !provided) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!secretMatches(request.headers.get('x-media-proxy-secret'))) {
    return deny(401, 'Unauthorized');
  }

  const grant = verifyVideoToken(request.nextUrl.searchParams.get('vt'));
  if (!grant) return deny(401, 'Invalid or expired grant');

  try {
    if (request.nextUrl.searchParams.get('evict') === '1') evictMedia(grant.scope, grant.refId);
    const media = await resolveMedia(grant.scope, grant.refId);
    return NextResponse.json(
      { downloadUrl: media.downloadUrl, mime: media.mime, size: media.size },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve recording';
    if (message === 'MEDIA_NOT_FOUND') return deny(404, 'Recording not found');
    if (message === 'RECORDING_SIZE_UNKNOWN') return deny(409, 'Recording size unknown');
    console.error('[media/source] resolve failed:', message);
    return deny(500, 'Failed to resolve recording');
  }
}
