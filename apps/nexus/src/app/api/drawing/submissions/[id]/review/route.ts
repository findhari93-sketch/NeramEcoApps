import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, getAssignmentDrawingRoster } from '@neram/database';
import {
  saveDrawingReviewWithAction,
  recordGamificationEvent,
  setSubmissionTags,
  recomputeExamAttemptScore,
  getDrawingReviewQueue,
} from '@neram/database/queries/nexus';
import type { GalleryReactionType } from '@neram/database/types';
import { reactionEmoji, praiseFor } from '@/lib/assignment-reactions';
import { sendNudge, plainToHtmlWithLink } from '@/lib/nudge-delivery';
import { canPostToGraph } from '@/lib/teams-assignment-announcements';
import { shareBaseUrl } from '@/lib/class-share-links';
import { buildReviewMessage, gradeLabel, shouldNotifyStudent } from '@/lib/drawing-review-message';
import { markVoiceSent } from '@/lib/drawing-voice-feedback';
import { pickNextPending } from '@/lib/review-next';
import { evalTables } from '@/lib/drawing-eval/db';
import { heldSubmissionIds, holdReview, releaseModeFor } from '@/lib/drawing-hold';
import { syncRegionMarks } from '@/lib/drawing-region-sync';

// One student, but a Teams chat post (chat create, card, maybe a plain retry)
// runs inside this request, and the default budget is tight for that.
export const maxDuration = 30;

const REACTION_TYPES: GalleryReactionType[] = ['heart', 'clap', 'fire', 'star', 'wow'];
function parseReaction(input: unknown): GalleryReactionType | null {
  return REACTION_TYPES.includes(input as GalleryReactionType) ? (input as GalleryReactionType) : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    const msUser = await verifyMsToken(authHeader);
    const { id } = await params;

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type, name')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type ?? '')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Fetch current status before update to detect re-reviews. assignment_id tells
    // us this drawing answers a class assignment (drives the grade scale + notify).
    //
    // The whole row, not a column list. exam_attempt_id tells us this drawing
    // belongs to a scheduled exam (so marking it moves that attempt from
    // provisional to final, and the student is never messaged before results are
    // published), but staging does not have that column yet. Naming it made
    // PostgREST answer with an error and no row, which left this route treating
    // every drawing as if it belonged to no assignment: no grade scale, and no
    // notification to anybody.
    const { data: currentSub, error: currentSubError } = await supabase
      .from('drawing_submissions' as any)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (currentSubError) {
      throw new Error(`Could not load the drawing: ${currentSubError.message}`);
    }
    if (!currentSub) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }
    const sub = currentSub as any;
    const wasAlreadyReviewed = ['reviewed', 'redo', 'completed'].includes(sub?.status || '');

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

    // Mirror the region boxes onto drawing_annotation, beside the canvas marks
    // and the AI's own. Every save path passes through here, so none can skip
    // it. Only when the field was actually sent, and never allowed to fail the
    // review: a sheet must still save where the marks tables do not exist.
    if (Object.prototype.hasOwnProperty.call(body, 'ai_overlay_annotations')) {
      try {
        await syncRegionMarks(supabase, id, user.id, ai_overlay_annotations);
      } catch (err) {
        console.error('[Drawing review] region boxes were not mirrored:', err);
      }
    }

    // Draft: save fields without changing status or sending notifications
    if (reviewAction === 'draft') {
      await supabase
        .from('drawing_submissions' as any)
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

    // Held assignments: finish the review, tell nobody yet.
    //
    // The default is 'immediate', so every assignment that existed before this
    // behaves exactly as it always has and this branch is never taken. A new
    // drawing assignment can opt into holding, and then Complete and Redo stop
    // being the moment the student hears: a separate hand-back is.
    //
    // Nothing below this point runs in that case: no status flip, no voice note
    // marked sent, no gamification, no sendNudge. Those all belong to the
    // release, because they are the things the student can see.
    const releaseMode = await releaseModeFor(supabase, sub?.assignment_id ?? null);
    if (releaseMode === 'held') {
      const held = await holdReview({
        supabase,
        evalDb: evalTables(supabase),
        submissionId: id,
        userId: user.id,
        intent: reviewAction === 'redo' ? 'redo' : 'complete',
        fields: {
          tutor_rating: tutor_rating || null,
          tutor_marks: tutorMarks,
          tutor_feedback: tutor_feedback || null,
          reviewed_image_url: reviewed_image_url || null,
          corrected_image_url: corrected_image_url || null,
          ai_overlay_annotations: ai_overlay_annotations || null,
          tutor_resources: tutor_resources || [],
          reaction,
        },
      });
      if (Array.isArray(tag_labels)) {
        await setSubmissionTags(id, tag_labels, user.id);
      }

      // "Next" skips anything already held. A held review keeps its
      // 'submitted' status on purpose, so the student sees nothing, which also
      // means the plain pending filter would hand the teacher back the sheets
      // they had just finished, round and round.
      const { rows } = await getAssignmentDrawingRoster(sub.assignment_id);
      const pending = rows
        .filter((r: any) => r.drawing && ['submitted', 'under_review'].includes(r.drawing.status))
        .map((r: any) => ({ id: r.drawing.id as string, submitted_at: r.drawing.submitted_at }));
      const alreadyHeld = await heldSubmissionIds(supabase, pending.map((p: { id: string }) => p.id));
      const next = pickNextPending(
        pending.filter((p: { id: string }) => !alreadyHeld.has(p.id)),
        id,
      );

      return NextResponse.json({
        ok: true,
        held: true,
        intent: held.intent,
        held_count: held.heldCount,
        next_submission_id: next.nextId,
        remaining: next.remaining,
      });
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

    // An exam drawing moves the student's total the moment it is marked.
    //
    // Best-effort: a teacher who has just graded a drawing must not see an
    // error because a derived score could not be recomputed. The publish
    // preflight recomputes every attempt again anyway, so a miss here is
    // recovered rather than permanent.
    if (sub?.exam_attempt_id) {
      try {
        await recomputeExamAttemptScore(sub.exam_attempt_id);
      } catch (err) {
        console.error('[Drawing review] exam score was not recomputed:', err);
      }
    }

    // When this drawing answers a class assignment, load it once: it drives the
    // grade scale (marks vs stars) for the student message and the point scaling.
    let assignment:
      | { id: string; title: string; evaluation_type: string; max_marks: number }
      | null = null;
    if (sub?.assignment_id) {
      const { data: a } = await (supabase.from('nexus_class_assignments' as any) as any)
        .select('id, title, evaluation_type, max_marks')
        .eq('id', sub.assignment_id)
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

    // The voice note recorded for this attempt goes out with this decision, never
    // on its own. Exam drawings cannot have one (the voice route refuses them).
    let voice: { duration_ms: number } | null = null;
    if (sub?.assignment_id && !sub?.exam_attempt_id) {
      try {
        voice = await markVoiceSent(id);
      } catch (err) {
        console.error('[Drawing review] voice note was not marked sent:', err);
      }
    }

    // Tell the student, through the one door: their Teams chat (a card from this
    // teacher, which they can reply to), the Teams activity feed and the Nexus
    // bell. Redo used to send nothing at all; Complete only rang the bell.
    let delivery: Record<string, unknown> | null = null;
    const notify =
      !!assignment &&
      shouldNotifyStudent({
        action: reviewAction,
        previousStatus: sub?.status ?? null,
        hasAssignment: true,
        isExam: !!sub?.exam_attempt_id,
        voiceSentNow: !!voice,
      });
    if (notify && assignment) {
      try {
        const link = `${shareBaseUrl(request.nextUrl.origin)}/student/assignments/${assignment.id}`;
        const emoji = reactionEmoji(reaction);
        const message = buildReviewMessage({
          action: reviewAction,
          assignmentTitle: assignment.title,
          teacherName: (user as any).name ?? null,
          gradeText:
            reviewAction === 'complete'
              ? gradeLabel({
                  evaluationType: assignment.evaluation_type,
                  rating: tutor_rating || null,
                  marks: tutorMarks,
                  maxMarks: assignment.max_marks,
                })
              : null,
          praiseLine: reviewAction === 'complete' ? `${emoji ? `${emoji} ` : ''}${praiseFor(reaction)}` : null,
          imageUrl: sub?.original_image_url ?? null,
          voiceDurationMs: voice?.duration_ms ?? null,
          link,
        });

        const graphToken = extractBearerToken(authHeader);
        const { results } = await sendNudge({
          studentIds: [submission.student_id],
          subject: message.subject,
          plain: message.plain,
          html: plainToHtmlWithLink(message.plain, link, message.buttonLabel),
          teamsText: message.teamsText,
          eventType: 'assignment_reviewed',
          metadata: {
            assignment_id: assignment.id,
            submission_id: id,
            action: reviewAction,
            has_voice: !!voice,
          },
          // The teacher opened this student's own work, so they picked the recipient.
          respectDormancy: false,
          ...(canPostToGraph(graphToken)
            ? {
                chat: {
                  delegatedToken: graphToken,
                  html: message.chatHtml,
                  attachments: [message.chatAttachment],
                  fallbackHtml: message.fallbackHtml,
                },
              }
            : {}),
        });
        const r = results[0];
        delivery = r
          ? { chat: r.chat, teams: r.teams, inapp: r.inapp, email: r.email, reasons: r.reasons ?? null }
          : null;
      } catch (err) {
        console.error('[Drawing review] student was not notified:', err);
      }
    }

    // Notify student if this is a re-review (the older practice-drawing list reads this)
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

    // Save and next: the drawing waiting longest in the same place the teacher
    // came from. A redo row is waiting on the student, not the teacher, so only
    // attempts that are actually submitted count.
    let next: { nextId: string | null; remaining: number } = { nextId: null, remaining: 0 };
    try {
      if (sub?.assignment_id) {
        const { rows } = await getAssignmentDrawingRoster(sub.assignment_id);
        next = pickNextPending(
          rows
            .filter((r) => r.drawing && ['submitted', 'under_review'].includes(r.drawing.status))
            .map((r) => ({ id: r.drawing!.id, submitted_at: r.drawing!.submitted_at })),
          id,
        );
      } else {
        const queue = await getDrawingReviewQueue({ status: 'submitted', limit: 25 });
        next = pickNextPending(
          (queue as any[]).map((s) => ({ id: s.id, submitted_at: s.submitted_at })),
          id,
        );
      }
    } catch (err) {
      console.error('[Drawing review] next drawing lookup failed:', err);
    }

    return NextResponse.json({
      submission,
      voice_sent: !!voice,
      delivery,
      next_submission_id: next.nextId,
      remaining: next.remaining,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save review';
    console.error('Drawing review PATCH error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
