import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/classrooms/[id]/batches
 * List batches for a classroom with student counts.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: batches, error } = await supabase
      .from('nexus_batches')
      .select('*')
      .eq('classroom_id', id)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;

    // Get student counts per batch
    const { data: enrollments } = await supabase
      .from('nexus_enrollments')
      .select('batch_id')
      .eq('classroom_id', id)
      .eq('role', 'student')
      .eq('is_active', true);

    const batchCounts: Record<string, number> = {};
    let unassignedCount = 0;
    for (const e of enrollments || []) {
      if (e.batch_id) {
        batchCounts[e.batch_id] = (batchCounts[e.batch_id] || 0) + 1;
      } else {
        unassignedCount++;
      }
    }

    const result = (batches || []).map((b: any) => ({
      ...b,
      studentCount: batchCounts[b.id] || 0,
    }));

    return NextResponse.json({ batches: result, unassignedCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load batches';
    console.error('Batches GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/classrooms/[id]/batches
 * Create a new batch in a classroom.
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
    const { name, description } = body;

    if (!name) {
      return NextResponse.json({ error: 'Batch name is required' }, { status: 400 });
    }

    const { data: batch, error } = await supabase
      .from('nexus_batches')
      .insert({
        classroom_id: id,
        name,
        description: description || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A batch with this name already exists' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ batch }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create batch';
    console.error('Batches POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
