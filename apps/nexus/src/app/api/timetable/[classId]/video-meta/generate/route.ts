import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { resolveClassStaffAccess } from '@/lib/class-staff-access';
import { VIDEO_META_CLASS_COLS, VIDEO_META_COLS, type VideoMetaClass } from '@/lib/class-video-meta-cols';
import { generateVideoMetaForClass } from '@/lib/class-video-meta-ai';

/**
 * POST /api/timetable/[classId]/video-meta/generate  (staff)
 *
 * Run the metadata prompt server-side and store the result, instead of the
 * teacher carrying it to an outside chatbot and carrying the JSON back.
 *
 * The copy-paste route next door stays exactly where it is. It is the fallback,
 * and it is not a theoretical one: this runs on the one shared GEMINI_API_KEY
 * that recaps, drawing feedback and class summaries also use, so a busy
 * afternoon really does 429 here. When that happens the panel shows the reason
 * and the Copy prompt button is still sitting beside this one.
 *
 * Body: { force?: boolean } to overwrite a listing a teacher already edited.
 * Off by default, because there is no undo on that row.
 */

interface Ctx {
  params: { classId: string };
}

/** What the teacher should read when the generator declines or fails. */
const OUTCOME_MESSAGES: Record<string, string> = {
  edited_by_teacher: 'This listing was edited by a teacher, so it was left alone. Use Regenerate to replace it.',
  status_ready: 'This listing is already marked ready to upload, so it was left alone.',
  status_published: 'This class is already published, so its listing was left alone.',
  already_has_title: 'This listing already has a title, so it was left alone. Use Regenerate to replace it.',
  class_not_found: 'That class no longer exists.',
  gemini_429: 'The shared AI key is rate limited right now. Try again shortly, or use Copy prompt below.',
  unparseable: 'The AI did not return usable JSON. Try again, or use Copy prompt below.',
  invalid_patch: 'The AI returned something YouTube would reject. Try again, or use Copy prompt below.',
};

function messageFor(reason: string): string {
  return OUTCOME_MESSAGES[reason] || `Could not generate the listing (${reason}).`;
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}));
    const supabase = getSupabaseAdminClient() as any;

    const access = await resolveClassStaffAccess<VideoMetaClass>(
      supabase, msUser.oid, params.classId, VIDEO_META_CLASS_COLS,
    );
    if ('error' in access) return access.error;
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Only staff can prepare a recording' }, { status: 403 });
    }

    const outcome = await generateVideoMetaForClass(supabase, params.classId, {
      force: body.force === true,
    });

    if (outcome.status === 'skipped') {
      return NextResponse.json(
        { generated: false, reason: outcome.reason, message: messageFor(outcome.reason) },
        // Not an error: the row is intact and the teacher's own work is why.
        { status: 200 },
      );
    }

    if (outcome.status === 'failed') {
      const rateLimited = outcome.reason === 'gemini_429';
      return NextResponse.json(
        { generated: false, reason: outcome.reason, error: messageFor(outcome.reason) },
        { status: rateLimited ? 429 : 502 },
      );
    }

    // Hand back the stored row so the panel can jump straight to the review step
    // without a second round trip.
    const { data: meta } = await supabase
      .from('nexus_class_video_meta')
      .select(VIDEO_META_COLS)
      .eq('scheduled_class_id', params.classId)
      .maybeSingle();

    return NextResponse.json({ generated: true, meta, warnings: outcome.warnings });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate the listing';
    console.error('Video meta generate error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
