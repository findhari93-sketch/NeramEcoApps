// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/students/[id]/nexus-enroll — Enroll student in a Nexus classroom + optional batch
 * Body: { classroomId, batchId? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;
    const body = await request.json();
    const { classroomId, batchId } = body;

    if (!classroomId) {
      return NextResponse.json({ error: 'classroomId is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    // Upsert enrollment (user_id + classroom_id is unique)
    const { data: enrollment, error } = await supabase
      .from('nexus_enrollments')
      .upsert(
        {
          user_id: userId,
          classroom_id: classroomId,
          role: 'student',
          is_active: true,
          batch_id: batchId || null,
        },
        { onConflict: 'user_id,classroom_id' }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, enrollment });
  } catch (error: any) {
    console.error('Error enrolling student:', error);
    return NextResponse.json({ error: error.message || 'Failed to enroll student' }, { status: 500 });
  }
}

/**
 * GET /api/students/[id]/nexus-enroll — Get student's current Nexus enrollment
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;
    const supabase = getSupabaseAdminClient() as any;

    const { data, error } = await supabase
      .from('nexus_enrollments')
      .select('id, classroom_id, batch_id, role, is_active, classroom:nexus_classrooms(id, name, type), batch:nexus_batches(id, name)')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error: any) {
    console.error('Error fetching enrollments:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch enrollments' }, { status: 500 });
  }
}
