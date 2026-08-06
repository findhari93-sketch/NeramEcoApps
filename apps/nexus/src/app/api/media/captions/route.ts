import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { verifyVideoToken } from '@/lib/video-token';

/**
 * GET /api/media/captions?vt=vid_...
 *
 * Subtitles for a class recording, behind the same door as the bytes.
 *
 * A <track src> is a plain URL that the browser fetches with no Authorization
 * header, exactly like the video element itself. That is why this takes the same
 * signed grant as /api/media/recording rather than a bearer token, and why the
 * WEBVTT is not served from storage or a blob URL: on a lecture recording the
 * transcript IS the content. Handing it out unauthenticated would give away in
 * text what the byte proxy exists to protect in video.
 *
 * Scope is deliberately narrow. Only a `class` or `recap` grant resolves to a
 * transcript, because those are the only two that name a scheduled class.
 */

export const runtime = 'nodejs';

function deny(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Which scheduled class a grant is about.
 *
 * A `class` grant already names one. A `recap` grant names a recap row, which
 * points at the class. `foundation` names a chapter with no class and no
 * transcript, so it gets nothing rather than a wrong one.
 */
async function classIdForGrant(
  // `any` matching every other nexus route: the generated Database type does not
  // carry the nexus_* tables, so a typed client rejects them by name.
  supabase: any,
  scope: string,
  refId: string,
): Promise<string | null> {
  if (scope === 'class') return refId;
  if (scope !== 'recap') return null;

  const { data } = await supabase
    .from('nexus_class_recaps')
    .select('scheduled_class_id')
    .eq('id', refId)
    .maybeSingle();

  return (data?.scheduled_class_id as string | undefined) ?? null;
}

export async function GET(request: NextRequest) {
  const grant = verifyVideoToken(request.nextUrl.searchParams.get('vt'));
  if (!grant) return deny(401, 'This caption link has expired. Reload the page to keep watching.');

  try {
    const supabase = getSupabaseAdminClient() as any;
    const classId = await classIdForGrant(supabase, grant.scope, grant.refId);
    if (!classId) return deny(404, 'No captions for this recording.');

    const { data } = await supabase
      .from('nexus_class_transcripts')
      .select('vtt, status')
      .eq('class_id', classId)
      .maybeSingle();

    const vtt = data?.status === 'ok' ? (data.vtt as string | null) : null;
    if (!vtt) return deny(404, 'No captions for this recording.');

    return new NextResponse(vtt, {
      status: 200,
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        // Private and short: the grant it rode in on expires in ten minutes, so
        // a longer cache would outlive its own authority.
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    });
  } catch {
    return deny(500, 'Could not load captions.');
  }
}
