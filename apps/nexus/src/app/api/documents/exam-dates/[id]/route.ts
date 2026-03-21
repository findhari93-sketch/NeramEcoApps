import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * PATCH /api/documents/exam-dates/[id] (teacher-only)
 * Update an exam date record
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Teacher check
    const { data: teacher } = await (supabase as any)
      .from('nexus_enrollments')
      .select('id')
      .eq('user_id', user.id)
      .eq('role', 'teacher')
      .eq('is_active', true)
      .limit(1)
      .single();
    if (!teacher) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const body = await request.json();

    const { data, error } = await (supabase as any)
      .from('nexus_exam_dates')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ exam_date: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update exam date';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/documents/exam-dates/[id] (teacher-only)
 * Soft delete: sets is_active = false
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Teacher check
    const { data: teacher } = await (supabase as any)
      .from('nexus_enrollments')
      .select('id')
      .eq('user_id', user.id)
      .eq('role', 'teacher')
      .eq('is_active', true)
      .limit(1)
      .single();
    if (!teacher) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const { error } = await (supabase as any)
      .from('nexus_exam_dates')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete exam date';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
