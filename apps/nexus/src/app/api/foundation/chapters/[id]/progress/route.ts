import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { upsertChapterProgress, upsertFoundationWatchSession } from '@neram/database/queries/nexus';

/**
 * POST /api/foundation/chapters/[id]/progress
 *
 * Update student's progress for a chapter.
 * Body: { status?, last_section_id?, last_video_position_seconds? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id: chapterId } = await params;
    const body = await request.json();
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const updateData: any = {};

    if (body.status) updateData.status = body.status;
    if (body.last_section_id) updateData.last_section_id = body.last_section_id;
    if (body.last_video_position_seconds !== undefined) {
      updateData.last_video_position_seconds = body.last_video_position_seconds;
    }
    if (body.last_pdf_page !== undefined) {
      updateData.last_pdf_page = body.last_pdf_page;
    }
    if (body.last_audio_position_seconds !== undefined) {
      updateData.last_audio_position_seconds = body.last_audio_position_seconds;
    }
    if (body.last_audio_language !== undefined) {
      updateData.last_audio_language = body.last_audio_language;
    }

    // If starting a chapter, set started_at
    if (body.status === 'in_progress') {
      updateData.started_at = new Date().toISOString();
    }

    const progress = await upsertChapterProgress(user.id, chapterId, updateData);

    // Persist watch session data (non-blocking — don't fail the progress save)
    if (body.watch_session?.id && body.watch_session?.section_id) {
      try {
        await upsertFoundationWatchSession(user.id, chapterId, body.watch_session);
      } catch (wsErr) {
        console.error('Watch session save error:', wsErr);
      }
    }

    return NextResponse.json({ progress });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update progress';
    console.error('Foundation progress POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
