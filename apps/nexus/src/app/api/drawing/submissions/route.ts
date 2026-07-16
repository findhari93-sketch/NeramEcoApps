import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, getAssignment, getUserEnrollment, recordPointEvent } from '@neram/database';
import { createDrawingSubmissionWithThread, recordGamificationEvent } from '@neram/database/queries/nexus';
import { isSubmissionOnTime } from '@/lib/assignment-clock';


export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const { question_id, assignment_id, source_type, original_image_url, self_note } = body;

    if (!original_image_url || !source_type) {
      return NextResponse.json(
        { error: 'Missing required fields: original_image_url, source_type' },
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

    const { submission, isRedo, attemptNumber } = await createDrawingSubmissionWithThread({
      student_id: user.id,
      question_id: question_id || null,
      assignment_id: assignment_id || null,
      source_type,
      original_image_url,
      self_note: self_note || null,
    });

    // Gamification
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
          points: isRedo ? 3 : 5,
          source_id: `draw_${submission.id}`,
          activity_type: 'drawing_submitted',
          activity_title: isRedo ? `Resubmitted drawing (attempt #${attemptNumber})` : 'Submitted a drawing practice',
          metadata: { question_id, submission_id: submission.id, attempt_number: attemptNumber },
        }).catch(() => {});
      }
    } catch { /* Non-critical */ }

    // On-time parity for DRAWING ASSIGNMENTS: award the same +15 on-time bonus as
    // document assignments (idempotent per assignment). Drawing keeps its native
    // drawing_submitted/drawing_reviewed points; we do NOT emit assignment_submitted
    // here so the leaderboard never double-counts the submission itself.
    if (assignment_id) {
      try {
        const assignment = await getAssignment(assignment_id);
        if (assignment) {
          const enr = await getUserEnrollment(user.id, assignment.classroom_id);
          const onTime = isSubmissionOnTime(
            {
              class_date: assignment.class_date,
              enrolled_at: (enr as any)?.enrolled_at ?? null,
              due_at: assignment.due_at,
              catchup_window_days: assignment.catchup_window_days ?? 7,
            },
            submission.submitted_at || new Date().toISOString(),
          );
          if (onTime) {
            await recordPointEvent({
              student_id: user.id,
              classroom_id: assignment.classroom_id,
              batch_id: (enr as any)?.batch_id ?? null,
              event_type: 'assignment_ontime',
              points: 15,
              source_id: assignment_id,
              metadata: { assignment_id, drawing_submission_id: submission.id },
            });
          }
        }
      } catch (e) { console.error('drawing assignment on-time award failed:', e); }
    }

    return NextResponse.json({ submission, attemptNumber }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create submission';
    console.error('Drawing submission POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
