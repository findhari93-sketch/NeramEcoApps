import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { saveDrawingReviewWithAction, recordGamificationEvent } from '@neram/database/queries/nexus';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await params;

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type ?? '')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Fetch current status before update to detect re-reviews
    const { data: currentSub } = await supabase
      .from('drawing_submissions')
      .select('status, student_id')
      .eq('id', id)
      .single();
    const wasAlreadyReviewed = ['reviewed', 'redo', 'completed'].includes(currentSub?.status || '');

    const body = await request.json();
    const { tutor_rating, tutor_feedback, reviewed_image_url, corrected_image_url, ai_overlay_annotations, tutor_resources, action } = body;
    const reviewAction = action || 'complete'; // backward compat

    // Draft: save fields without changing status or sending notifications
    if (reviewAction === 'draft') {
      await supabase
        .from('drawing_submissions')
        .update({
          tutor_rating: tutor_rating || null,
          tutor_feedback: tutor_feedback || null,
          reviewed_image_url: reviewed_image_url || null,
          corrected_image_url: corrected_image_url || null,
          ai_overlay_annotations: ai_overlay_annotations || null,
          tutor_resources: tutor_resources || [],
        })
        .eq('id', id);
      return NextResponse.json({ ok: true, draft: true });
    }

    const submission = await saveDrawingReviewWithAction(id, {
      tutor_rating: tutor_rating || null,
      tutor_feedback: tutor_feedback || null,
      reviewed_image_url: reviewed_image_url || null,
      corrected_image_url: corrected_image_url || null,
      ai_overlay_annotations: ai_overlay_annotations || null,
      tutor_resources: tutor_resources || [],
    }, reviewAction);

    // Gamification: 10 points for completed (non-critical)
    if (reviewAction === 'complete') {
      try {
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
            points: 10,
            source_id: `review_${submission.id}`,
            activity_type: 'drawing_reviewed',
            activity_title: 'Drawing reviewed and completed by tutor',
            metadata: { submission_id: submission.id, rating: tutor_rating },
          }).catch(() => {});
        }
      } catch {
        // Non-critical
      }
    }

    // Notify student if this is a re-review
    if (wasAlreadyReviewed) {
      void Promise.resolve(
        supabase
          .from('drawing_notifications' as any)
          .insert({
            student_id: submission.student_id,
            submission_id: id,
            message: 'Your teacher has reviewed your drawing again. Check the updated feedback.',
          })
      ).catch(() => {}); // non-critical, fire and forget
    }

    return NextResponse.json({ submission });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save review';
    console.error('Drawing review PATCH error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
