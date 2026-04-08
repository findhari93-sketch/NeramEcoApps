import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { createDrawingSubmissionWithThread, recordGamificationEvent } from '@neram/database/queries/nexus';
import { generateDrawingAIFeedback } from '@/lib/drawing-ai';

export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const { question_id, source_type, original_image_url, self_note } = body;

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
          event_type: isRedo ? 'drawing_redo_submitted' : 'drawing_submitted',
          points: isRedo ? 3 : 5,
          source_id: `draw_${submission.id}`,
          activity_type: isRedo ? 'drawing_redo_submitted' : 'drawing_submitted',
          activity_title: isRedo ? `Resubmitted drawing (attempt #${attemptNumber})` : 'Submitted a drawing practice',
          metadata: { question_id, submission_id: submission.id, attempt_number: attemptNumber },
        }).catch(() => {});
      }
    } catch { /* Non-critical */ }

    // Fire-and-forget background AI draft generation (does not block student)
    generateDrawingAIFeedback(submission.id).catch((err) => {
      console.error('Background AI draft generation failed for submission', submission.id, err);
    });

    return NextResponse.json({ submission, attemptNumber }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create submission';
    console.error('Drawing submission POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
