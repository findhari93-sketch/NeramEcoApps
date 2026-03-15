import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/classrooms/[id]/enrollments?batch={batchId}&role={teacher|student}
 * List enrollments with user details and batch info.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const batchId = request.nextUrl.searchParams.get('batch');
    const role = request.nextUrl.searchParams.get('role');

    let query = supabase
      .from('nexus_enrollments')
      .select('*, user:users(id, name, email, avatar_url, user_type), batch:nexus_batches(id, name)')
      .eq('classroom_id', id)
      .eq('is_active', true);

    if (batchId) {
      if (batchId === 'unassigned') {
        query = query.is('batch_id', null);
      } else {
        query = query.eq('batch_id', batchId);
      }
    }

    if (role) {
      query = query.eq('role', role);
    }

    const { data, error } = await query.order('enrolled_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ enrollments: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load enrollments';
    console.error('Enrollments GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/classrooms/[id]/enrollments
 * Enroll a user into the classroom.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
    const { user_id, role, batch_id } = body;

    if (!user_id || !role) {
      return NextResponse.json({ error: 'user_id and role are required' }, { status: 400 });
    }

    const { data: enrollment, error } = await supabase
      .from('nexus_enrollments')
      .upsert(
        { user_id, classroom_id: id, role, batch_id: batch_id || null },
        { onConflict: 'user_id,classroom_id' }
      )
      .select('*, user:users(id, name, email, avatar_url), batch:nexus_batches(id, name)')
      .single();

    if (error) throw error;

    return NextResponse.json({ enrollment }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to enroll user';
    console.error('Enrollments POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/classrooms/[id]/enrollments
 * Bulk update batch assignments.
 * Body: { enrollment_ids: string[], batch_id: string | null }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params;
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
    const { enrollment_ids, batch_id } = body;

    if (!enrollment_ids || !Array.isArray(enrollment_ids) || enrollment_ids.length === 0) {
      return NextResponse.json({ error: 'enrollment_ids array is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('nexus_enrollments')
      .update({ batch_id: batch_id || null })
      .in('id', enrollment_ids)
      .select();

    if (error) throw error;

    return NextResponse.json({ updated: data?.length || 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update enrollments';
    console.error('Enrollments PATCH error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
