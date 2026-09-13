/**
 * Handing held drawing reviews back to students.
 *
 * Two passes, on purpose, the same split the exam flow uses:
 *
 *  1. RELEASE writes the record. Each held submission's status flips to
 *     completed or redo, its voice note is marked sent, its evaluation is
 *     stamped released, points are awarded. Nothing is announced.
 *  2. NOTIFY walks the batch in chunks and tells each student.
 *
 * The order is load-bearing. The record is written before anything is said, so a
 * Teams card can never arrive for a review that failed to save. And fifty-eight
 * personalised cards will not fit one function budget: a timeout while
 * announcing must never cost the teacher the release itself.
 */

import {
  saveDrawingReviewWithAction,
  recordGamificationEvent,
} from '@neram/database/queries/nexus';
import { markVoiceSent } from '@/lib/drawing-voice-feedback';
import { sendNudge, plainToHtmlWithLink } from '@/lib/nudge-delivery';
import { canPostToGraph } from '@/lib/teams-assignment-announcements';
import { buildReviewMessage, gradeLabel } from '@/lib/drawing-review-message';
import { reactionEmoji, praiseFor } from '@/lib/assignment-reactions';
import type { ReviewIntent } from '@/lib/drawing-hold';

/** Students announced per notify call. Comfortably inside one function budget. */
export const NOTIFY_CHUNK = 15;

export interface HeldReview {
  submissionId: string;
  studentId: string;
  intent: ReviewIntent;
  reviewedAt: string | null;
  evaluationId: string;
}

/** Everything on an assignment that is finished and waiting to be handed back. */
export async function loadHeld(supabase: any, assignmentId: string): Promise<HeldReview[]> {
  const { data: subs, error } = await supabase
    .from('drawing_submissions')
    .select('id, student_id')
    .eq('assignment_id', assignmentId);
  if (error) throw new Error(error.message);
  const byId = new Map<string, string>(
    ((subs ?? []) as Array<{ id: string; student_id: string }>).map((s) => [s.id, s.student_id]),
  );
  if (byId.size === 0) return [];

  const { data: evals, error: evalError } = await supabase
    .from('drawing_evaluation')
    .select('id, submission_id, intent, reviewed_at')
    .in('submission_id', [...byId.keys()])
    .eq('source', 'manual')
    .not('intent', 'is', null)
    .is('released_at', null)
    .order('reviewed_at', { ascending: true });
  if (evalError) throw new Error(evalError.message);

  return ((evals ?? []) as Array<{ id: string; submission_id: string; intent: ReviewIntent; reviewed_at: string | null }>)
    .map((e) => ({
      submissionId: e.submission_id,
      studentId: byId.get(e.submission_id) as string,
      intent: e.intent,
      reviewedAt: e.reviewed_at,
      evaluationId: e.id,
    }));
}

/** Whole days since an ISO timestamp, never negative. */
export function daysSince(iso: string | null, now = Date.now()): number {
  if (!iso) return 0;
  const ms = now - new Date(iso).getTime();
  return ms > 0 ? Math.floor(ms / 86_400_000) : 0;
}

export interface ReleaseArgs {
  supabase: any;
  assignmentId: string;
  userId: string;
  kind: 'all' | 'selection' | 'single';
  /** Only for selection or single. Anything not actually held is ignored. */
  submissionIds?: string[];
}

export async function releaseHeld({ supabase, assignmentId, userId, kind, submissionIds }: ReleaseArgs) {
  const held = await loadHeld(supabase, assignmentId);
  const wanted = kind === 'all' ? null : new Set(submissionIds ?? []);
  const toRelease = wanted ? held.filter((h) => wanted.has(h.submissionId)) : held;
  if (toRelease.length === 0) return { batchId: null as string | null, released: 0 };

  const { data: batch, error: batchError } = await supabase
    .from('drawing_release_batch')
    .insert({ assignment_id: assignmentId, created_by: userId, kind, submission_count: toRelease.length })
    .select('id')
    .single();
  if (batchError) throw new Error(`Could not start the hand-back: ${batchError.message}`);
  const batchId = batch.id as string;

  const { data: assignment } = await supabase
    .from('nexus_class_assignments')
    .select('id, evaluation_type, max_marks')
    .eq('id', assignmentId)
    .maybeSingle();

  let released = 0;
  for (const item of toRelease) {
    // Re-save with the values ALREADY stored, so the status flip, the thread
    // update and the gallery default all come from the one function that has
    // always done them, rather than a second copy of that logic here.
    const { data: row } = await supabase
      .from('drawing_submissions')
      .select('*')
      .eq('id', item.submissionId)
      .maybeSingle();
    if (!row) continue;

    await saveDrawingReviewWithAction(item.submissionId, {
      tutor_rating: row.tutor_rating ?? null,
      tutor_marks: row.tutor_marks ?? null,
      tutor_feedback: row.tutor_feedback ?? null,
      reviewed_image_url: row.reviewed_image_url ?? null,
      corrected_image_url: row.corrected_image_url ?? null,
      ai_overlay_annotations: row.ai_overlay_annotations ?? null,
      tutor_resources: row.tutor_resources ?? [],
      reaction: row.reaction ?? null,
      is_gallery_visible: typeof row.is_gallery_visible === 'boolean' ? row.is_gallery_visible : undefined,
    }, item.intent);

    try {
      await markVoiceSent(item.submissionId);
    } catch (err) {
      console.error('[Drawing release] voice note was not marked sent:', err);
    }

    const { error: stampError } = await supabase
      .from('drawing_evaluation')
      .update({
        status: 'released',
        released_at: new Date().toISOString(),
        released_by: userId,
        release_batch_id: batchId,
      })
      .eq('id', item.evaluationId);
    if (stampError) throw new Error(`Could not mark a review released: ${stampError.message}`);

    if (item.intent === 'complete') {
      try {
        const { data: enrollment } = await supabase
          .from('nexus_enrollments')
          .select('classroom_id, batch_id')
          .eq('user_id', item.studentId)
          .eq('role', 'student')
          .limit(1)
          .maybeSingle();
        if (enrollment) {
          const marks = row.tutor_marks as number | null;
          const points =
            assignment?.evaluation_type === 'marks' && marks != null && assignment.max_marks > 0
              ? Math.round((marks / assignment.max_marks) * 20)
              : 10;
          recordGamificationEvent({
            student_id: item.studentId,
            classroom_id: enrollment.classroom_id,
            batch_id: enrollment.batch_id || null,
            event_type: 'drawing_reviewed',
            points,
            source_id: `review_${item.submissionId}`,
            activity_type: 'drawing_reviewed',
            activity_title: 'Drawing reviewed and completed by tutor',
            metadata: { submission_id: item.submissionId, rating: row.tutor_rating, marks },
          }).catch(() => {});
        }
      } catch {
        // Points are never worth failing a hand-back over.
      }
    }

    released += 1;
  }

  await supabase
    .from('drawing_release_batch')
    .update({ released_at: new Date().toISOString(), submission_count: released })
    .eq('id', batchId);

  return { batchId, released };
}

export interface NotifyArgs {
  supabase: any;
  batchId: string;
  /** The teacher's delegated token, so the card can land in each student's Teams chat. */
  graphToken: string | null;
  teacherName: string | null;
  linkBase: string;
}

/**
 * Announce the next chunk of a released batch.
 *
 * Returns what is left, and the dialog calls again until nothing is. The cursor
 * lives on the batch row, so a notify call that dies halfway resumes where it
 * stopped instead of messaging the first fifteen students twice.
 */
export async function notifyBatchChunk({ supabase, batchId, graphToken, teacherName, linkBase }: NotifyArgs) {
  const { data: batch, error } = await supabase
    .from('drawing_release_batch')
    .select('id, assignment_id, notify_cursor, notified_count')
    .eq('id', batchId)
    .maybeSingle();
  if (error || !batch) throw new Error('That hand-back could not be found');

  const { data: evals } = await supabase
    .from('drawing_evaluation')
    .select('submission_id, intent')
    .eq('release_batch_id', batchId)
    .order('submission_id', { ascending: true });
  const all = (evals ?? []) as Array<{ submission_id: string; intent: ReviewIntent }>;

  const start = batch.notify_cursor ?? 0;
  const chunk = all.slice(start, start + NOTIFY_CHUNK);

  const { data: assignment } = await supabase
    .from('nexus_class_assignments')
    .select('id, title, evaluation_type, max_marks')
    .eq('id', batch.assignment_id)
    .maybeSingle();

  let notified = 0;
  for (const item of chunk) {
    try {
      const { data: row } = await supabase
        .from('drawing_submissions')
        .select('*')
        .eq('id', item.submission_id)
        .maybeSingle();
      if (!row || !assignment) continue;

      const { data: voice } = await supabase
        .from('drawing_voice_feedback')
        .select('duration_ms, sent_at')
        .eq('submission_id', item.submission_id)
        .maybeSingle();

      const link = `${linkBase}/student/assignments/${assignment.id}`;
      const emoji = reactionEmoji(row.reaction);
      const message = buildReviewMessage({
        action: item.intent,
        assignmentTitle: assignment.title,
        teacherName,
        gradeText:
          item.intent === 'complete'
            ? gradeLabel({
                evaluationType: assignment.evaluation_type,
                rating: row.tutor_rating || null,
                marks: row.tutor_marks ?? null,
                maxMarks: assignment.max_marks,
              })
            : null,
        praiseLine: item.intent === 'complete' ? `${emoji ? `${emoji} ` : ''}${praiseFor(row.reaction)}` : null,
        imageUrl: row.original_image_url ?? null,
        voiceDurationMs: voice?.sent_at ? voice.duration_ms : null,
        link,
      });

      await sendNudge({
        studentIds: [row.student_id],
        subject: message.subject,
        plain: message.plain,
        html: plainToHtmlWithLink(message.plain, link, message.buttonLabel),
        teamsText: message.teamsText,
        eventType: 'assignment_reviewed',
        metadata: {
          assignment_id: assignment.id,
          submission_id: item.submission_id,
          action: item.intent,
          release_batch_id: batchId,
        },
        respectDormancy: false,
        ...(canPostToGraph(graphToken)
          ? {
              chat: {
                delegatedToken: graphToken as string,
                html: message.chatHtml,
                attachments: [message.chatAttachment],
                fallbackHtml: message.fallbackHtml,
              },
            }
          : {}),
      });
      notified += 1;
    } catch (err) {
      console.error('[Drawing release] a student was not notified:', err);
    }
  }

  const cursor = start + chunk.length;
  await supabase
    .from('drawing_release_batch')
    .update({ notify_cursor: cursor, notified_count: (batch.notified_count ?? 0) + notified })
    .eq('id', batchId);

  return { notified, remaining: Math.max(0, all.length - cursor), total: all.length };
}
