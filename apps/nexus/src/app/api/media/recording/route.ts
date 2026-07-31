import { NextRequest, NextResponse } from 'next/server';
import { verifyVideoToken } from '@/lib/video-token';
import { resolveMedia, evictMedia } from '@/lib/recording-source-cache';
import {
  resolveByteRange,
  formatContentRange,
  formatUnsatisfiedRange,
  DEFAULT_MAX_CHUNK_BYTES,
} from '@/lib/http-range';

/**
 * GET /api/media/recording?vt=vid_...
 *
 * The one byte proxy for class recordings. Students never receive a Microsoft or
 * SharePoint URL: they receive this path plus a signed grant, and the bytes come
 * back through Nexus. Copying the src out of devtools yields a URL that stops
 * working within ten minutes and that names the student who used it.
 *
 * Authorization is the HMAC grant alone, never Graph. See video-token.ts for why
 * (short version: a <video> makes hundreds of range requests and each Graph call
 * would be a network round trip).
 *
 * Every response is a 206 carrying at most MAX_CHUNK bytes, including for a
 * plain "bytes=0-" or a request with no Range at all. See http-range.ts for why
 * (short version: it keeps each invocation short regardless of video length,
 * which is what makes this viable on a serverless platform).
 */

export const runtime = 'nodejs';
/** Each invocation moves one small window, so it never approaches this. */
export const maxDuration = 60;

const MAX_CHUNK = Number(process.env.RECORDING_MAX_CHUNK_BYTES) || DEFAULT_MAX_CHUNK_BYTES;

function deny(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest) {
  const grant = verifyVideoToken(request.nextUrl.searchParams.get('vt'));
  if (!grant) return deny(401, 'This video link has expired. Reload the page to keep watching.');

  try {
    let media = await resolveMedia(grant.scope, grant.refId);

    // The grant carries the size it was minted with, so a stale cache entry
    // cannot silently change the file out from under an in-flight watch.
    const size = media.size || grant.size;
    if (!size) return deny(409, 'This recording is not ready to stream yet.');

    const resolution = resolveByteRange(request.headers.get('range'), size, MAX_CHUNK);
    if (resolution.kind === 'unsatisfiable') {
      return new NextResponse(null, {
        status: 416,
        headers: {
          'Content-Range': formatUnsatisfiedRange(size),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store',
        },
      });
    }

    const { range, contentLength } = resolution;

    let upstream = await fetchWindow(media.downloadUrl, range.start, range.end);

    // A pre-authenticated Graph URL outlives its usefulness inside a long class.
    // One re-resolve, then give up: retrying forever on a genuinely dead
    // recording would turn a broken video into a hot loop.
    if (upstream.status === 403 || upstream.status === 410 || upstream.status === 404) {
      evictMedia(grant.scope, grant.refId);
      media = await resolveMedia(grant.scope, grant.refId);
      upstream = await fetchWindow(media.downloadUrl, range.start, range.end);
    }

    if (upstream.status === 200) {
      // The source ignored Range and is sending the whole file. Passing that
      // through would stream hundreds of megabytes through one invocation, which
      // is the exact failure this design exists to avoid.
      upstream.body?.cancel().catch(() => {});
      console.error('[media] upstream ignored Range', { scope: grant.scope, refId: grant.refId });
      return deny(502, 'The recording source refused a partial request.');
    }

    if (upstream.status !== 206 || !upstream.body) {
      console.error('[media] upstream error', {
        status: upstream.status,
        scope: grant.scope,
        refId: grant.refId,
      });
      return deny(502, 'Could not read the recording.');
    }

    // Streamed straight through. Buffering it would defeat the chunking and
    // allocate the window in memory for every concurrent viewer.
    return new NextResponse(upstream.body, {
      status: 206,
      headers: {
        'Content-Type': media.mime,
        'Content-Length': String(contentLength),
        'Content-Range': formatContentRange(range, size),
        'Accept-Ranges': 'bytes',
        'Content-Disposition': 'inline',
        // private keeps this out of any shared cache while still letting the
        // browser reuse chunks, so scrubbing back over watched video is free.
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to stream recording';
    if (message === 'MEDIA_NOT_FOUND') return deny(404, 'That recording is no longer available.');
    if (message === 'RECORDING_SIZE_UNKNOWN') {
      return deny(409, 'This recording is not ready to stream yet.');
    }
    console.error('[media] stream failed:', message);
    return deny(500, 'Failed to stream recording');
  }
}

function fetchWindow(downloadUrl: string, start: number, end: number): Promise<Response> {
  return fetch(downloadUrl, {
    headers: { Range: `bytes=${start}-${end}` },
    // Undici would otherwise buffer the whole body before resolving.
    cache: 'no-store',
  });
}
