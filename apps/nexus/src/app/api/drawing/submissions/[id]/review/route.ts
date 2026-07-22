import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, createUserNotification } from '@neram/database';
import { saveDrawingReviewWithAction, recordGamificationEvent, setSubmissionTags } from '@neram/database/queries/nexus';
import type { GalleryReactionType } from '@neram/database/types';
import { reactionEmoji, praiseFor } from '@/lib/assignment-reactions';

const REACTION_TYPES: GalleryReactionType[] = ['heart', 'clap', 'fire', 'star', 'wow'];
function parseReaction(input: unknown): GalleryReactionType | null {
  return REACTION_TYPES.includes(input as GalleryReactionType) ? (input as GalleryReactionType) : null;
}

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

    // Fetch current status before update to detect re-reviews. assignment_id tells
    // us this drawing answers a class assignment (drives the grade scale + notify).
    const { data: currentSub } = await supabase
      .from('drawing_submissions')
      .select('status, student_id, assignment_id')
      .eq('id', id)
      .single();
    const wasAlreadyReviewed = ['reviewed', 'redo', 'completed'].includes(currentSub?.status || '');

    const body = await request.json();
    const {
      tutor_rating,
      tutor_marks,
      tutor_feedback,
      reviewed_image_url,
      corrected_image_url,
      ai_overlay_annotations,
      tutor_resources,
      reaction: rawReaction,
      action,
      is_gallery_visible,
      tag_labels,
    } = body;
    const reviewAction = action || 'complete'; // backward compat
    const reaction = parseReaction(rawReaction);
    const tutorMarks =
      tutor_marks !== null && tutor_marks !== undefined && tutor_marks !== '' && Number.isFinite(Number(tutor_marks))
        ? Number(tutor_marks)
        : null;

    // Draft: save fields without changing status or sending notifications
    if (reviewAction === 'draft') {
      await supabase
        .from('drawing_submissions')
        .update({
          tutor_rating: tutor_rating || null,
          tutor_marks: tutorMarks,
          tutor_feedback: tutor_feedback || null,
          reviewed_image_url: reviewed_image_url || null,
          corrected_image_url: corrected_image_url || null,
          ai_overlay_annotations: ai_overlay_annotations || null,
          tutor_resources: tutor_resources || [],
          reaction,
        })
        .eq('id', id);
      // Tags can be edited while drafting, persist them alongside
      if (Array.isArray(tag_labels)) {
        await setSubmissionTags(id, tag_labels, user.id);
      }
      return NextResponse.json({ ok: true, draft: true });
    }

    const submission = await saveDrawingReviewWithAction(id, {
      tutor_rating: tutor_rating || null,
      tutor_marks: tutorMarks,
      tutor_feedback: tutor_feedback || null,
      reviewed_image_url: reviewed_image_url || null,
      corrected_image_url: corrected_image_url || null,
      ai_overlay_annotations: ai_overlay_annotations || null,
      tutor_resources: tutor_resources || [],
      reaction,
      is_gallery_visible: typeof is_gallery_visible === 'boolean' ? is_gallery_visible : undefined,
    }, reviewAction);

    if (Array.isArray(tag_labels)) {
      await setSubmissionTags(id, tag_labels, user.id);
    }

    // When this drawing answers a class assignment, load it once: it drives the
    // grade scale (marks vs stars) for the student ping and the point scaling.
    let assignment:
      | { id: string; title: string; evaluation_type: string; max_marks: number }
      | null = null;
    if (currentSub?.assignment_id) {
      const { data: a } = await (supabase.from('nexus_class_assignments' as any) as any)
        .select('id, title, evaluation_type, max_marks')
        .eq('id', currentSub.assignment_id)
        .single();
      assignment = (a as any) ?? null;
    }

    // Gamification for completed (non-critical). Marks-graded assignment drawings
    // scale up to 20 pts by the score; everything else keeps the flat 10.
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
          const points =
            assignment && assignment.evaluation_type === 'marks' && tutorMarks != null && assignment.max_marks > 0
              ? Math.round((tutorMarks / assignment.max_marks) * 20)
              : 10;
          recordGamificationEvent({
            student_id: submission.student_id,
            classroom_id: (enrollment as any).classroom_id,
            batch_id: (enrollment as any).batch_id || null,
            event_type: 'drawing_reviewed',
            points,
            source_id: `review_${submission.id}`,
            activity_type: 'drawing_reviewed',
            activity_title: 'Drawing reviewed and completed by tutor',
            metadata: { submission_id: submission.id, rating: tutor_rating, marks: tutorMarks },
          }).catch(() => {});
        }
      } catch {
        // Non-critical
      }
    }

    // Always-visible top-bar bell ping for an assignment drawing (deep-links to the
    // student's assignment page), carrying the grade + the teacher's reaction.
    if (reviewAction === 'complete' && assignment) {
      const isStars = assignment.evaluation_type !== 'marks';
      const gradeText = isStars
        ? tutor_rating
          ? `${tutor_rating}/5 stars`
          : 'a star rating'
        : tutorMarks != null
          ? `${tutorMarks}/${assignment.max_marks} marks`
          : 'your marks';
      const emoji = reactionEmoji(reaction);
      createUserNotification({
        user_id: submission.student_id,
        event_type: 'assignment_reviewed',
        title: `Assignment reviewed: ${assignment.title}`,
        message: `You got ${gradeText}. ${emoji ? emoji + ' ' : ''}${praiseFor(reaction)}`.trim(),
        metadata: { assignment_id: assignment.id },
      }).catch((e) => console.error('assignment_reviewed bell notify failed:', e));
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
