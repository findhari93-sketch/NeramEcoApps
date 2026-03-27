import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  createDrawingSubmission,
  getStudentSubmissions,
  getPendingSubmissions,
} from '@neram/database/queries';
import { recordGamificationEvent } from '@neram/database/queries/nexus';

/**
 * GET /api/drawings/submissions?classroom={id}&exercise={id}
 *
 * If exercise is provided: returns student's own submissions for that exercise
 * If only classroom: returns pending submissions for teacher evaluation
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom');
    const exerciseId = request.nextUrl.searchParams.get('exercise');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (exerciseId) {
      // Student: get own submissions for an exercise
      const submissions = await getStudentSubmissions(user.id, exerciseId);
      return NextResponse.json({ submissions });
    }

    // Teacher: get all pending submissions for classroom
    const submissions = await getPendingSubmissions(classroomId);
    return NextResponse.json({ submissions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load submissions';
    console.error('Submissions GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/drawings/submissions
 *
 * Student submits a drawing.
 * Body: { exercise_id, submission_url }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const { exercise_id, submission_url } = body;

    if (!exercise_id || !submission_url) {
      return NextResponse.json(
        { error: 'Missing required fields: exercise_id, submission_url' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const submission = await createDrawingSubmission({
      exercise_id,
      student_id: user.id,
      submission_url,
    });

    // Record gamification points for drawing submission
    try {
      const { data: enrollment } = await supabase
        .from('nexus_enrollments')
        .select('classroom_id, batch_id')
        .eq('user_id', user.id)
        .eq('role', 'student')
        .limit(1)
        .single();

      if (enrollment) {
        recordGamificationEvent({
          student_id: user.id,
          classroom_id: (enrollment as any).classroom_id,
          batch_id: (enrollment as any).batch_id || null,
          event_type: 'drawing_submitted',
          points: 20,
          source_id: `draw_${(submission as any).id}`,
          activity_type: 'drawing_submitted',
          activity_title: 'Submitted a drawing',
          metadata: { exercise_id, submission_id: (submission as any).id },
        }).catch(() => {});
      }
    } catch {
      // Non-critical
    }

    return NextResponse.json({ submission }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create submission';
    console.error('Submissions POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
