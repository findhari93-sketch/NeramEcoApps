import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { upsertStudentNote } from '@neram/database/queries/nexus';

/**
 * GET /api/foundation/sections/[id]/notes
 *
 * Returns the student's note for a section.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id: sectionId } = await params;
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: note } = await supabase
      .from('nexus_foundation_student_notes')
      .select('*')
      .eq('student_id', user.id)
      .eq('section_id', sectionId)
      .single();

    return NextResponse.json({ note: note || null });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load note';
    console.error('Foundation notes GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * PUT /api/foundation/sections/[id]/notes
 *
 * Create or update the student's note for a section.
 * Body: { note_text: string, video_timestamp_seconds?: number }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id: sectionId } = await params;
    const body = await request.json();
    const supabase = getSupabaseAdminClient();

    if (typeof body.note_text !== 'string') {
      return NextResponse.json({ error: 'Missing note_text' }, { status: 400 });
    }

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const note = await upsertStudentNote(
      user.id,
      sectionId,
      body.note_text,
      body.video_timestamp_seconds
    );

    return NextResponse.json({ note });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save note';
    console.error('Foundation notes PUT error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
