import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/ms-verify';
import { isImpersonationToken, verifyImpersonationToken } from '@/lib/impersonation-token';
import { getAppOnlyToken } from '@neram/auth';

const VALID_SIZES = ['48x48', '64x64', '96x96', '120x120', '240x240', '360x360', '432x432', '504x504', '648x648'];

/**
 * GET /api/graph/photo?oid={ms_oid}&size={48x48|120x120|240x240|648x648}
 * GET /api/graph/photo?self=true&size=120x120
 *
 * Proxies Microsoft Graph profile photos with caching.
 * Returns binary image data or 404 if no photo exists.
 */
export async function GET(request: NextRequest) {
  const token = extractBearerToken(request.headers.get('Authorization'));
  if (!token) {
    return NextResponse.json({ error: 'Missing authorization' }, { status: 401 });
  }

  const self = request.nextUrl.searchParams.get('self') === 'true';
  const oid = request.nextUrl.searchParams.get('oid');
  const size = request.nextUrl.searchParams.get('size') || '120x120';

  if (!self && !oid) {
    return NextResponse.json({ error: 'Provide oid or self=true' }, { status: 400 });
  }

  const photoSize = VALID_SIZES.includes(size) ? size : '120x120';

  // Build Graph URL + the token to call it with. An impersonation token is not
  // a real Graph token, so resolve the target oid (the impersonated student for
  // self=true, otherwise the requested oid) and call Graph with an app-only
  // token instead. This keeps avatars authentic while viewing as a student.
  let graphBase: string;
  let graphToken = token;

  if (isImpersonationToken(token)) {
    const payload = verifyImpersonationToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid impersonation token' }, { status: 401 });
    }
    const effectiveOid = self ? payload.targetMsOid : oid;
    if (!effectiveOid) {
      return NextResponse.json({ fallback: true }, { status: 404 });
    }
    try {
      graphToken = await getAppOnlyToken();
    } catch (err) {
      console.error('App-only token error (photo):', err);
      return NextResponse.json({ fallback: true }, { status: 404 });
    }
    graphBase = `https://graph.microsoft.com/v1.0/users/${effectiveOid}/photos/${photoSize}/$value`;
  } else {
    graphBase = self
      ? `https://graph.microsoft.com/v1.0/me/photos/${photoSize}/$value`
      : `https://graph.microsoft.com/v1.0/users/${oid}/photos/${photoSize}/$value`;
  }

  try {
    const response = await fetch(graphBase, {
      headers: { Authorization: `Bearer ${graphToken}` },
    });

    if (response.status === 404) {
      return NextResponse.json({ fallback: true }, { status: 404 });
    }

    if (response.status === 401) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 });
    }

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch photo' }, { status: response.status });
    }

    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('Content-Type') || 'image/jpeg';

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
    console.error('Graph photo proxy error:', err);
    return NextResponse.json({ error: 'Graph API request failed' }, { status: 502 });
  }
}
