import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/modules/[id]/items/[itemId]/sections/[sectionId]/notes
 * Get student note for a section.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string; sectionId: string }> }
) {
  try {
    const { sectionId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    // Look up user
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: note } = await supabase
      .from('nexus_module_student_notes')
      .select('*')
      .eq('student_id', user.id)
      .eq('section_id', sectionId)
      .single();

    return NextResponse.json({ note: note || null });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load note';
    console.error('Module notes GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * PUT /api/modules/[id]/items/[itemId]/sections/[sectionId]/notes
 * Save/update note for a section.
 * Body: { note_text: string, video_timestamp_seconds?: number }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string; sectionId: string }> }
) {
  try {
    const { sectionId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const body = await request.json();

    if (typeof body.note_text !== 'string') {
      return NextResponse.json({ error: 'Missing note_text' }, { status: 400 });
    }

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
      section_id: sectionId,
      note_text: body.note_text,
    };

    if (body.video_timestamp_seconds !== undefined) {
      upsertData.video_timestamp_seconds = body.video_timestamp_seconds;
    }

    const { data: note, error } = await supabase
      .from('nexus_module_student_notes')
      .upsert(upsertData, { onConflict: 'student_id,section_id' })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ note });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save note';
    console.error('Module notes PUT error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
