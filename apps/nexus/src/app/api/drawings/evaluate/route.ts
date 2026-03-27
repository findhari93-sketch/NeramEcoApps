import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { evaluateSubmission } from '@neram/database/queries';
import { recordGamificationEvent } from '@neram/database/queries/nexus';

/**
 * POST /api/drawings/evaluate
 *
 * Teacher evaluates a submission.
 * Body: { submission_id, status: 'approved' | 'redo' | 'graded', grade?, teacher_notes?, correction_url? }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const { submission_id, status, grade, teacher_notes, correction_url } = body;

    if (!submission_id || !status) {
      return NextResponse.json(
        { error: 'Missing required fields: submission_id, status' },
        { status: 400 }
      );
    }

    if (!['approved', 'redo', 'graded'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be approved, redo, or graded' },
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

    const result = await evaluateSubmission(submission_id, {
      status,
      grade,
      teacher_notes,
      correction_url,
      evaluated_by: user.id,
    });

    // Record gamification points for student whose drawing was reviewed
    try {
      const submission = result as any;
      if (submission?.student_id) {
        const { data: enrollment } = await supabase
          .from('nexus_enrollments')
          .select('classroom_id, batch_id')
          .eq('user_id', submission.student_id)
          .eq('role', 'student')
          .limit(1)
          .single();

        if (enrollment) {
          recordGamificationEvent({
            student_id: submission.student_id,
            classroom_id: (enrollment as any).classroom_id,
            batch_id: (enrollment as any).batch_id || null,
            event_type: 'drawing_reviewed',
            points: 5,
            source_id: `draw_rev_${submission_id}`,
            activity_type: 'drawing_reviewed',
            activity_title: `Drawing reviewed by teacher (${status})`,
            metadata: { submission_id, status, grade },
          }).catch(() => {});
        }
      }
    } catch {
      // Non-critical
    }

    return NextResponse.json({ submission: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to evaluate submission';
    console.error('Evaluate POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
