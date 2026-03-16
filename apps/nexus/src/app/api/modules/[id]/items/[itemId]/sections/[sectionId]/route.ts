import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

async function verifyTeacher(request: NextRequest) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient() as any;
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type')
    .eq('ms_oid', msUser.oid)
    .single();
  if (!user || (user.user_type !== 'teacher' && user.user_type !== 'admin')) {
    throw new Error('Not authorized');
  }
  return user;
}

/**
 * PATCH /api/modules/[id]/items/[itemId]/sections/[sectionId]
 * Update a section (Admin).
 * Body: partial { title?, description?, start_timestamp_seconds?, end_timestamp_seconds?, sort_order?, min_questions_to_pass? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string; sectionId: string }> }
) {
  try {
    await verifyTeacher(request);
    const { sectionId } = await params;
    const supabase = getSupabaseAdminClient() as any;
    const body = await request.json();

    if (body.end_timestamp_seconds != null && body.start_timestamp_seconds != null) {
      if (body.end_timestamp_seconds <= body.start_timestamp_seconds) {
        return NextResponse.json(
          { error: 'end_timestamp must be greater than start_timestamp' },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.start_timestamp_seconds !== undefined) updateData.start_timestamp_seconds = body.start_timestamp_seconds;
    if (body.end_timestamp_seconds !== undefined) updateData.end_timestamp_seconds = body.end_timestamp_seconds;
    if (body.sort_order !== undefined) updateData.sort_order = body.sort_order;
    if (body.min_questions_to_pass !== undefined) updateData.min_questions_to_pass = body.min_questions_to_pass;

    const { data: section, error } = await supabase
      .from('nexus_module_item_sections')
      .update(updateData)
      .eq('id', sectionId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ section });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update section';
    console.error('Module section PATCH error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/modules/[id]/items/[itemId]/sections/[sectionId]
 * Delete a section (cascades to questions) (Admin).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string; sectionId: string }> }
) {
  try {
    await verifyTeacher(request);
    const { sectionId } = await params;
    const supabase = getSupabaseAdminClient() as any;

    const { error } = await supabase
      .from('nexus_module_item_sections')
      .delete()
      .eq('id', sectionId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete section';
    console.error('Module section DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
