import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { staffClassroomIds } from '@/lib/sketchbook-access';
import {
  SENDER_STATE_COOKIE,
  buildSenderAuthorizeUrl,
  newSenderState,
  senderAppConfig,
  senderRedirectUri,
  signSenderState,
} from '@/lib/teams-sender';

/**
 * POST /api/teams/sender/start   (staff)
 * body { classroom_id, return_to? }
 *
 * Begins "Connect Teams": returns the Microsoft sign-in URL for the browser to
 * open, and sets a signed, short-lived cookie that the callback checks. JSON, not
 * a redirect, because Nexus authenticates with a bearer token a plain navigation
 * cannot send.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}));
    const classroomId = typeof body?.classroom_id === 'string' ? body.classroom_id : '';
    if (!classroomId) throw new ApiError('Missing classroom_id', 400);
    const mine = await staffClassroomIds(caller);
    if (!mine.includes(classroomId)) throw new ApiError('You do not teach this classroom.', 403);

    const cfg = senderAppConfig();
    if (!cfg) throw new ApiError('Teams sending is not set up on this server.', 503);

    const state = newSenderState(caller.id, classroomId, typeof body?.return_to === 'string' ? body.return_to : '');
    const redirectUri = senderRedirectUri(request.nextUrl.origin);
    const url = buildSenderAuthorizeUrl(cfg, { redirectUri, state: state.s });

    const res = NextResponse.json({ url }, { headers: { 'Cache-Control': 'no-store' } });
    res.cookies.set(SENDER_STATE_COOKIE, signSenderState(state, cfg.clientSecret), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      // lax survives the top-level redirect back from login.microsoftonline.com.
      sameSite: 'lax',
      path: '/api/teams/sender',
      maxAge: 600,
    });
    return res;
  } catch (err) {
    return errorResponse(err, 'Could not start connecting Teams');
  }
}
