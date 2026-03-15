import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * PUT /api/classrooms/[id]/batches/[batchId]
 * Update batch name or description.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; batchId: string }> }
) {
  try {
    const { batchId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, is_active } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data: batch, error } = await supabase
      .from('nexus_batches')
      .update(updateData)
      .eq('id', batchId)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A batch with this name already exists' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ batch });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update batch';
    console.error('Batch PUT error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/classrooms/[id]/batches/[batchId]
 * Soft-delete a batch. Removes batch assignment from all enrolled students.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; batchId: string }> }
) {
  try {
    const { batchId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Remove batch assignment from students
    await supabase
      .from('nexus_enrollments')
      .update({ batch_id: null })
      .eq('batch_id', batchId);

    // Soft-delete the batch
    const { error } = await supabase
      .from('nexus_batches')
      .update({ is_active: false })
      .eq('id', batchId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete batch';
    console.error('Batch DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
