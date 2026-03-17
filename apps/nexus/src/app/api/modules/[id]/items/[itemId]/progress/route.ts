import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/modules/[id]/items/[itemId]/progress
 * Save student progress (video position, section, status).
 * Body: { status?, last_section_id?, last_video_position_seconds? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { itemId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const body = await request.json();

    // Look up user
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const upsertData: Record<string, unknown> = {
      student_id: user.id,
      module_item_id: itemId,
    };

    if (body.status) upsertData.status = body.status;
    if (body.last_section_id) upsertData.last_section_id = body.last_section_id;
    if (body.last_video_position_seconds !== undefined) {
      upsertData.last_video_position_seconds = body.last_video_position_seconds;
    }
    if (body.last_pdf_page !== undefined) {
      upsertData.last_pdf_page = body.last_pdf_page;
    }
    if (body.last_audio_position_seconds !== undefined) {
      upsertData.last_audio_position_seconds = body.last_audio_position_seconds;
    }
    if (body.last_audio_language !== undefined) {
      upsertData.last_audio_language = body.last_audio_language;
    }

    // Set timestamps based on status
    if (body.status === 'in_progress') {
      upsertData.started_at = new Date().toISOString();
    }
    if (body.status === 'completed') {
      upsertData.completed_at = new Date().toISOString();
    }

    const { data: progress, error } = await supabase
      .from('nexus_module_student_progress')
      .upsert(upsertData, { onConflict: 'student_id,module_item_id' })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ progress });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update progress';
    console.error('Module item progress POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
