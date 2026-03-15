import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/classrooms
 * List all classrooms (admin/teacher). Returns classrooms with batch and student counts.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    // Look up user
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get all active classrooms
    const { data: classrooms, error } = await supabase
      .from('nexus_classrooms')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get enrollment counts and batch counts per classroom
    const classroomIds = (classrooms || []).map((c: any) => c.id);

    const [enrollmentResult, batchResult] = await Promise.all([
      supabase
        .from('nexus_enrollments')
        .select('classroom_id, role')
        .in('classroom_id', classroomIds)
        .eq('is_active', true),
      supabase
        .from('nexus_batches')
        .select('classroom_id')
        .in('classroom_id', classroomIds)
        .eq('is_active', true),
    ]);

    // Count students and teachers per classroom
    const enrollmentCounts: Record<string, { students: number; teachers: number }> = {};
    for (const e of enrollmentResult.data || []) {
      if (!enrollmentCounts[e.classroom_id]) enrollmentCounts[e.classroom_id] = { students: 0, teachers: 0 };
      if (e.role === 'student') enrollmentCounts[e.classroom_id].students++;
      else enrollmentCounts[e.classroom_id].teachers++;
    }

    // Count batches per classroom
    const batchCounts: Record<string, number> = {};
    for (const b of batchResult.data || []) {
      batchCounts[b.classroom_id] = (batchCounts[b.classroom_id] || 0) + 1;
    }

    const result = (classrooms || []).map((c: any) => ({
      ...c,
      studentCount: enrollmentCounts[c.id]?.students || 0,
      teacherCount: enrollmentCounts[c.id]?.teachers || 0,
      batchCount: batchCounts[c.id] || 0,
    }));

    return NextResponse.json({ classrooms: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load classrooms';
    console.error('Classrooms GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/classrooms
 * Create a new classroom. Auto-enrolls creator as teacher.
 */
export async function POST(request: NextRequest) {
  try {
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
    const { name, type, description, ms_team_id } = body;

    if (!name || !type) {
      return NextResponse.json({ error: 'Name and type are required' }, { status: 400 });
    }

    if (!['nata', 'jee', 'revit', 'other'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    // Create classroom
    const { data: classroom, error } = await supabase
      .from('nexus_classrooms')
      .insert({
        name,
        type,
        description: description || null,
        ms_team_id: ms_team_id || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Auto-enroll creator as teacher
    await supabase
      .from('nexus_enrollments')
      .insert({
        user_id: user.id,
        classroom_id: classroom.id,
        role: 'teacher',
      });

    return NextResponse.json({ classroom }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create classroom';
    console.error('Classrooms POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
