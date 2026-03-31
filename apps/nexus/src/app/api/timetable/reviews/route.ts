import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/timetable/reviews?class_id={id}&classroom_id={id}
 * Teachers: see all reviews. Students: see their own.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classId = request.nextUrl.searchParams.get('class_id');
    const classroomId = request.nextUrl.searchParams.get('classroom_id');

    if (!classId || !classroomId) {
      return NextResponse.json({ error: 'Missing class_id and classroom_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', classroomId)
      .eq('is_active', true)
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Not enrolled' }, { status: 403 });
    }

    if (enrollment.role === 'teacher') {
      // Teachers see all reviews with student info
      const { data, error } = await supabase
        .from('nexus_class_reviews')
        .select('*, student:users!nexus_class_reviews_student_id_fkey(id, name, avatar_url)')
        .eq('scheduled_class_id', classId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Calculate average
      const ratings = (data || []).map((r: any) => r.rating).filter((r: any) => r != null && !isNaN(r));
      const average = ratings.length > 0
        ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length
        : 0;

      return NextResponse.json({
        reviews: data || [],
        summary: { average: Math.round(average * 10) / 10, count: ratings.length },
      });
    } else {
      // Students see only their own review
      const { data, error } = await supabase
        .from('nexus_class_reviews')
        .select('*')
        .eq('scheduled_class_id', classId)
        .eq('student_id', user.id)
        .maybeSingle();

      if (error) throw error;

      return NextResponse.json({ review: data });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load reviews';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/timetable/reviews
 * Student submits or updates their review for a completed class.
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { class_id, classroom_id, rating, comment } = await request.json();

    if (!class_id || !classroom_id || !rating) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating must be between 1 and 5' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify student is enrolled
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', classroom_id)
      .eq('is_active', true)
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Not enrolled' }, { status: 403 });
    }

    // Verify the class belongs to this classroom
    const { data: classCheck } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, status')
      .eq('id', class_id)
      .eq('classroom_id', classroom_id)
      .single();

    if (!classCheck) {
      return NextResponse.json({ error: 'Class not found in this classroom' }, { status: 404 });
    }

    if (classCheck.status !== 'completed') {
      return NextResponse.json({ error: 'Can only review completed classes' }, { status: 400 });
    }

    // Upsert review
    const { data, error } = await supabase
      .from('nexus_class_reviews')
      .upsert(
        {
          scheduled_class_id: class_id,
          student_id: user.id,
          rating,
          comment: comment || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'scheduled_class_id,student_id' }
      )
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json({ review: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save review';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
