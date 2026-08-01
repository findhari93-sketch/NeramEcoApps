import { NextRequest, NextResponse } from 'next/server';
import {
  getAssignment,
  getAssignmentDetail,
  getAssignmentRoster,
  getAssignmentDrawingRoster,
  updateAssignment,
  addAssignmentAttachments,
  removeAssignmentAttachment,
  attachTopicDrills,
  reviewSubmission,
  getSubmission,
  signSubmissionFiles,
  deleteAssignment,
  getUserEnrollment,
  getAssignmentReminderSummary,
  recordGamificationEvent,
  resolveAssignmentRecording,
  getStudentAssignmentDrawing,
  getAssignmentDrawingHistory,
  updateDrawingQuestion,
  deleteDrawingQuestion,
  createUserNotification,
  getSupabaseAdminClient,
  getAssignmentPaper,
  getAssignmentAttempt,
  getAssignmentAttemptsByStudent,
  saveAssignmentQuestions,
  clearAssignmentQuestions,
  validateAssignmentQuestions,
} from '@neram/database';
import type { GalleryReactionType } from '@neram/database/types';
import { getRequestUser, isStaff } from '@/lib/study-materials';
import { errorResponse, ApiError } from '@/lib/api-errors';
import { notifyAssignmentPublished, notifyAssignmentReviewed } from '@/lib/timetable-notifications';
import { reactionEmoji, praiseFor } from '@/lib/assignment-reactions';
import { classStartIso } from '@/lib/prework';
import { resolveSubmitMode, lockedReason } from '@/lib/assignment-submit-window';

/**
 * What the student may do with this assignment right now, resolved server-side
 * so the page never has to re-derive the rule. Both assignment types answer to
 * the same window: unmarked work inside the deadline can be replaced.
 */
function submitWindow(
  detail: any,
  enrollment: any,
  submission: { status: string; reviewed_at?: string | null } | null,
) {
  const mode = resolveSubmitMode(
    submission,
    {
      class_date: detail.class_date,
      enrolled_at: (enrollment as any)?.enrolled_at ?? null,
      due_at: detail.due_at,
      catchup_window_days: detail.catchup_window_days ?? 7,
    },
    new Date().toISOString(),
  );
  return {
    submit_mode: mode,
    submit_locked_reason: mode === 'locked' ? lockedReason(submission) : null,
  };
}

const REACTION_TYPES: GalleryReactionType[] = ['heart', 'clap', 'fire', 'star', 'wow'];
function parseReaction(input: unknown): GalleryReactionType | null {
  return REACTION_TYPES.includes(input as GalleryReactionType) ? (input as GalleryReactionType) : null;
}

/** Trimmed, deduped, capped list of valid https reference-image URLs. */
function sanitizeRefUrls(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    const s = String(v || '').trim();
    if (/^https?:\/\//i.test(s) && !seen.has(s)) {
      seen.add(s);
      out.push(s);
      if (out.length >= 6) break;
    }
  }
  return out;
}

/**
 * Sign a submission's current files AND every history[] snapshot's files, so the
 * "Previous attempts" timeline can open prior-round documents too.
 */
async function signSubmissionWithHistory(submission: any): Promise<any> {
  if (!submission) return null;
  const files = await signSubmissionFiles(submission.files || []);
  const history = Array.isArray(submission.history)
    ? await Promise.all(
        submission.history.map(async (h: any) => ({
          ...h,
          files: await signSubmissionFiles(h.files || []),
        })),
      )
    : submission.history;
  return { ...submission, files, history };
}

/**
 * GET /api/assignments/[id]
 * Staff: full assignment + attachments + roster matrix (each submission's files
 *   carry short-TTL signed read URLs).
 * Student: only when published and enrolled; returns the assignment + attachments
 *   + their own submission (own files signed).
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    const detail = await getAssignmentDetail(params.id);
    if (!detail) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

    if (isStaff(user)) {
      // Shared "already reminded" history so staff don't double-nag (per student:
      // how many reminders + when the last one went out).
      const reminders = await getAssignmentReminderSummary(params.id);

      // Drawing-type assignments are graded in the Drawing Review screen; return
      // a roster built from drawing_submissions with the drawing id to open.
      if ((detail as any).assignment_type === 'drawing') {
        const { rows } = await getAssignmentDrawingRoster(params.id);
        const counts = rows.reduce(
          (acc, r) => {
            acc.total += 1;
            acc[r.bucket] += 1;
            return acc;
          },
          { total: 0, submitted: 0, reviewed: 0, missing: 0 } as Record<string, number>,
        );
        return NextResponse.json({ assignment: detail, drawing_roster: rows, counts, reminders, role: 'staff' });
      }

      // Staff see the paper WITH its answer key: they wrote it, and they need it
      // to check a question that half the class got wrong.
      const paper = await getAssignmentPaper(params.id, true);
      const attemptsByStudent = paper
        ? await getAssignmentAttemptsByStudent(paper.test_id)
        : new Map();

      const { rows } = await getAssignmentRoster(params.id);
      const rosterWithUrls = await Promise.all(
        rows.map(async (r) => ({
          ...r,
          submission: await signSubmissionWithHistory(r.submission),
          answers: attemptsByStudent.get(r.student.id) ?? null,
        })),
      );
      const counts = rosterWithUrls.reduce(
        (acc, r) => {
          acc.total += 1;
          acc[r.bucket] += 1;
          return acc;
        },
        { total: 0, submitted: 0, late: 0, missing: 0 } as Record<string, number>,
      );
      return NextResponse.json({
        assignment: detail,
        roster: rosterWithUrls,
        counts,
        reminders,
        paper,
        role: 'staff',
      });
    }

    // Student branch: must be published and enrolled in the classroom.
    if (detail.status !== 'published') {
      throw new ApiError('This assignment is not available.', 403);
    }
    const enrollment = await getUserEnrollment(user.id, detail.classroom_id);
    if (!enrollment) throw new ApiError('You are not enrolled in this class.', 403);

    const recording = await resolveAssignmentRecording(detail);

    // Drawing-type assignments keep their submission in the Drawing channel
    // (drawing_submissions), so the student view renders the annotated review.
    if ((detail as any).assignment_type === 'drawing') {
      const [drawing, attempts] = await Promise.all([
        getStudentAssignmentDrawing(user.id, params.id),
        getAssignmentDrawingHistory(params.id, user.id),
      ]);
      return NextResponse.json({
        assignment: detail,
        drawing_submission: drawing,
        drawing_attempts: attempts,
        enrolled_at: (enrollment as any)?.enrolled_at ?? null,
        recording,
        role: 'student',
        ...submitWindow(detail, enrollment, drawing as any),
      });
    }

    const submission = await getSubmission(params.id, user.id);
    const signed = await signSubmissionWithHistory(submission);

    // The answer key is withheld until this student's own answers are locked in.
    // Asking for the attempt first, then re-reading the paper with answers only
    // once one exists, means an unanswered paper never carries the key over the
    // wire at all: it cannot leak from a payload it was never in.
    const blindPaper = await getAssignmentPaper(params.id, false);
    const attempt = blindPaper ? await getAssignmentAttempt(blindPaper.test_id, user.id) : null;
    const paper = attempt && blindPaper ? await getAssignmentPaper(params.id, true) : blindPaper;

    return NextResponse.json({
      assignment: detail,
      submission: signed,
      enrolled_at: (enrollment as any)?.enrolled_at ?? null,
      recording,
      role: 'student',
      paper,
      answers_locked: !!attempt,
      my_answers: attempt?.answers ?? null,
      my_result: attempt
        ? { score: attempt.score, total_marks: attempt.total_marks, percentage: attempt.percentage }
        : null,
      ...submitWindow(detail, enrollment, submission),
    });
  } catch (err) {
    return errorResponse(err, 'Failed to load assignment');
  }
}

/**
 * POST /api/assignments/[id]  (staff)
 * body { action: 'update', ...fields }
 * body { action: 'publish' } | { action: 'close' } | { action: 'reopen' }
 * body { action: 'add_attachment', study_file_id }
 * body { action: 'remove_attachment', attachment_id }
 * body { action: 'attach_topic_drills' }
 * body { action: 'review_submission', submission_id, marks, feedback, review_action: 'complete'|'redo' }
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    if (!isStaff(user)) throw new ApiError('Not authorized', 403);
    const body = await request.json();

    const assignment = await getAssignment(params.id);
    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

    switch (body.action) {
      case 'update': {
        const updates: Record<string, unknown> = {};
        if (body.title !== undefined) updates.title = String(body.title).trim();
        if (body.instructions !== undefined) updates.instructions = body.instructions || null;
        if (body.submission_format !== undefined) {
          const fmt = ['pdf', 'image', 'pdf_or_image'].includes(body.submission_format)
            ? body.submission_format
            : 'pdf_or_image';
          updates.submission_format = fmt;
        }
        if (body.max_marks !== undefined) {
          const m = Number(body.max_marks);
          if (!Number.isFinite(m) || m <= 0) {
            return NextResponse.json({ error: 'Max marks must be greater than 0' }, { status: 400 });
          }
          updates.max_marks = m;
        }
        // Grading scale change: stars pin max_marks to 5 (they store 1-5 on marks).
        if (body.evaluation_type === 'marks' || body.evaluation_type === 'stars') {
          updates.evaluation_type = body.evaluation_type;
          if (body.evaluation_type === 'stars') updates.max_marks = 5;
        }
        if (body.due_at !== undefined) updates.due_at = body.due_at || null;
        if (body.class_date !== undefined) updates.class_date = body.class_date;

        // Pre-class work is due when its class starts, always. Re-derive rather
        // than trusting the body: the edit form has no date field for prework,
        // so anything arriving in due_at for one is stale or wrong, and a
        // deadline that disagrees with its class is worse than no deadline.
        const nextTiming =
          body.timing === 'prework' || body.timing === 'homework'
            ? body.timing
            : ((assignment as any).timing ?? 'homework');
        if (body.timing !== undefined) updates.timing = nextTiming;

        const linkedClassId = (assignment as any).scheduled_class_id as string | null;
        if (nextTiming === 'prework' && linkedClassId) {
          const { data: cls } = await (getSupabaseAdminClient() as any)
            .from('nexus_scheduled_classes')
            .select('scheduled_date, start_time')
            .eq('id', linkedClassId)
            .maybeSingle();
          if (cls) {
            updates.due_at = classStartIso(cls.scheduled_date, cls.start_time || '00:00');
          }
        }
        if (body.content_image_url !== undefined) updates.content_image_url = body.content_image_url || null;
        // Multi-image reference path (drawing): the assignment keeps the first image
        // for its thumbnail; the full set syncs to the backing question below.
        let refUrls: string[] | null = null;
        if (body.reference_image_urls !== undefined) {
          refUrls = sanitizeRefUrls(body.reference_image_urls);
          updates.content_image_url = refUrls[0] ?? null;
        }
        if (body.content_video_url !== undefined) updates.content_video_url = body.content_video_url || null;
        if (body.links !== undefined && Array.isArray(body.links)) {
          updates.links = body.links
            .filter((l: any) => l && typeof l.url === 'string' && /^https?:\/\//i.test(l.url))
            .map((l: any) => ({ label: String(l.label || l.url).trim(), url: String(l.url).trim() }));
        }
        if (body.recording_url !== undefined) {
          updates.recording_url = body.recording_url || null;
          if (body.recording_url) {
            updates.recording_source =
              body.recording_source === 'youtube' || body.recording_source === 'sharepoint'
                ? body.recording_source
                : /youtube\.com|youtu\.be/i.test(String(body.recording_url))
                  ? 'youtube'
                  : 'sharepoint';
          } else {
            updates.recording_source = null;
          }
        }
        if (body.catchup_window_days !== undefined) {
          const w = Number(body.catchup_window_days);
          if (Number.isFinite(w) && w >= 0) updates.catchup_window_days = Math.round(w);
        }
        if (body.requires_pdf !== undefined) {
          const wantsPdf = body.requires_pdf !== false;
          // Turning it off is only allowed when there is something else to hand
          // in. Otherwise the student would face an assignment with no upload
          // and no questions, and no way to submit anything at all.
          if (!wantsPdf) {
            const paper = await getAssignmentPaper(params.id, false);
            const autoQuestions = paper?.questions.filter((q) => q.format !== 'SUBJECTIVE') ?? [];
            if (autoQuestions.length === 0) {
              return NextResponse.json(
                {
                  error:
                    'Add at least one multiple choice or numerical question before making the PDF optional, otherwise students have nothing to submit.',
                },
                { status: 400 },
              );
            }
          }
          updates.requires_pdf = wantsPdf;
        }
        const updated = await updateAssignment(params.id, updates);

        // Keep a drawing assignment's backing question in sync so the Drawing
        // Review screen shows the current brief + reference image.
        if ((assignment as any).assignment_type === 'drawing' && (assignment as any).drawing_question_id) {
          const qUpdate: { question_text?: string; reference_images?: Array<{ url: string }> } = {};
          if (body.instructions !== undefined) qUpdate.question_text = (body.instructions || updated.title) as string;
          if (refUrls !== null) {
            qUpdate.reference_images = refUrls.map((url) => ({ url }));
          } else if (body.content_image_url !== undefined) {
            qUpdate.reference_images = body.content_image_url ? [{ url: String(body.content_image_url) }] : [];
          }
          if (Object.keys(qUpdate).length) {
            await updateDrawingQuestion((assignment as any).drawing_question_id, qUpdate).catch((e) =>
              console.error('updateDrawingQuestion failed:', e),
            );
          }
        }
        return NextResponse.json({ assignment: updated });
      }

      case 'publish': {
        const updated = await updateAssignment(params.id, {
          status: 'published',
          published_at: new Date().toISOString(),
        });
        notifyAssignmentPublished(
          assignment.classroom_id,
          updated.title,
          params.id,
          updated.due_at,
        ).catch((e) => console.error('notifyAssignmentPublished failed:', e));
        return NextResponse.json({ assignment: updated });
      }

      case 'close': {
        const updated = await updateAssignment(params.id, { status: 'closed' });
        return NextResponse.json({ assignment: updated });
      }

      case 'reopen': {
        // Flip a closed assignment back to published so students can see and
        // submit it again. Unlike 'publish' this keeps published_at intact and
        // does NOT re-notify students (they were already notified originally).
        const updated = await updateAssignment(params.id, { status: 'published' });
        return NextResponse.json({ assignment: updated });
      }

      case 'add_attachment': {
        if (!body.study_file_id) {
          return NextResponse.json({ error: 'study_file_id is required' }, { status: 400 });
        }
        await addAssignmentAttachments(params.id, [{ study_file_id: body.study_file_id }]);
        const detail = await getAssignmentDetail(params.id);
        return NextResponse.json({ assignment: detail });
      }

      case 'remove_attachment': {
        if (!body.attachment_id) {
          return NextResponse.json({ error: 'attachment_id is required' }, { status: 400 });
        }
        await removeAssignmentAttachment(body.attachment_id);
        const detail = await getAssignmentDetail(params.id);
        return NextResponse.json({ assignment: detail });
      }

      case 'attach_topic_drills': {
        if (!assignment.topic_id) {
          return NextResponse.json(
            { error: 'This assignment has no linked topic to pull drills from.' },
            { status: 400 },
          );
        }
        const added = await attachTopicDrills(params.id, assignment.topic_id);
        const detail = await getAssignmentDetail(params.id);
        return NextResponse.json({ assignment: detail, added: added.length });
      }

      /**
       * Replace the assignment's question paper.
       *
       * Refused once anyone has answered. Editing a paper underneath a student
       * who has already sat it would re-key their answers against questions they
       * never saw, and the marks already shown to them would silently change.
       * Clearing and re-adding is the deliberate way to start over.
       */
      case 'save_questions': {
        const questions = Array.isArray(body.questions) ? body.questions : [];
        const invalid = validateAssignmentQuestions(questions);
        if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

        const current = await getAssignmentPaper(params.id, false);
        if (current) {
          const answered = await getAssignmentAttemptsByStudent(current.test_id);
          if (answered.size > 0) {
            return NextResponse.json(
              {
                error: `${answered.size} ${answered.size === 1 ? 'student has' : 'students have'} already answered these questions, so the paper cannot be changed.`,
                code: 'PAPER_ANSWERED',
              },
              { status: 409 },
            );
          }
        }

        const paper = await saveAssignmentQuestions(params.id, questions, {
          title: assignment.title,
          createdBy: user.id,
          classroomId: assignment.classroom_id,
        });
        return NextResponse.json({ paper });
      }

      case 'clear_questions': {
        const current = await getAssignmentPaper(params.id, false);
        if (current) {
          const answered = await getAssignmentAttemptsByStudent(current.test_id);
          if (answered.size > 0) {
            return NextResponse.json(
              {
                error: `${answered.size} ${answered.size === 1 ? 'student has' : 'students have'} already answered these questions, so the paper cannot be removed.`,
                code: 'PAPER_ANSWERED',
              },
              { status: 409 },
            );
          }
        }
        await clearAssignmentQuestions(params.id);
        // The PDF becomes the only thing left to hand in, so it must be required
        // again or the assignment would have no way to be submitted.
        await updateAssignment(params.id, { requires_pdf: true } as any);
        return NextResponse.json({ ok: true });
      }

      case 'review_submission': {
        if (!body.submission_id) {
          return NextResponse.json({ error: 'submission_id is required' }, { status: 400 });
        }
        const reviewAction = body.review_action === 'redo' ? 'redo' : 'complete';
        const isStars = (assignment as any).evaluation_type === 'stars';

        // With a question paper attached, the teacher is only asked to mark the
        // working, so the ceiling on what they type is the manual half, not the
        // assignment total. The auto marks are added below rather than trusted
        // from the client: the browser knows the score, but it must not be the
        // thing that decides it.
        const gradedPaper = isStars ? null : await getAssignmentPaper(params.id, false);
        const hasPaper = !!gradedPaper && gradedPaper.questions.length > 0;
        const manualCeiling = hasPaper ? gradedPaper!.manual_marks : assignment.max_marks;

        let marks: number | null = null;
        if (body.marks !== null && body.marks !== undefined && body.marks !== '') {
          const m = Number(body.marks);
          if (!Number.isFinite(m) || m < 0 || m > manualCeiling) {
            return NextResponse.json(
              {
                error: isStars
                  ? 'Rating must be between 1 and 5 stars.'
                  : hasPaper
                    ? `Marks for the working must be between 0 and ${manualCeiling}.`
                    : `Marks must be between 0 and ${assignment.max_marks}.`,
              },
              { status: 400 },
            );
          }
          marks = isStars ? Math.round(m) : m;
        }
        const reaction = parseReaction(body.reaction);
        const submission = await getSubmission(params.id, body.student_id ?? '');

        // Auto marks are read from the student's own attempt, server-side, and
        // added to whatever the teacher gave the working. One total goes on the
        // submission, because that is the number a student is owed an
        // explanation for.
        let finalMarks = marks;
        let autoMarks: number | null = null;
        if (hasPaper && body.student_id) {
          const attempt = await getAssignmentAttempt(gradedPaper!.test_id, body.student_id);
          autoMarks = attempt ? attempt.score : 0;
          if (reviewAction === 'complete' || marks != null) {
            finalMarks = Math.round(((marks ?? 0) + autoMarks) * 100) / 100;
          }
        }

        const reviewed = await reviewSubmission(body.submission_id, {
          marks: finalMarks,
          feedback: body.feedback ? String(body.feedback) : null,
          action: reviewAction,
          reviewed_by: user.id,
          reaction,
        });
        // Notify the owning student (student_id from the submission row).
        const studentId = reviewed.student_id || submission?.student_id;
        if (studentId) {
          notifyAssignmentReviewed(
            assignment.classroom_id,
            studentId,
            assignment.title,
            params.id,
            reviewAction,
          ).catch((e) => console.error('notifyAssignmentReviewed failed:', e));

          // Always-visible top-bar bell: a warm "reviewed" ping carrying the grade
          // and the teacher's reaction, deep-linking to the student's assignment.
          if (reviewAction === 'complete') {
            // finalMarks, not marks: the student is told the total they got,
            // which includes whatever their answers earned automatically.
            const gradeText = isStars
              ? finalMarks != null
                ? `${finalMarks}/5 stars`
                : 'a star rating'
              : finalMarks != null
                ? `${finalMarks}/${assignment.max_marks} marks`
                : 'your marks';
            const emoji = reactionEmoji(reaction);
            createUserNotification({
              user_id: studentId,
              event_type: 'assignment_reviewed',
              title: `Assignment reviewed: ${assignment.title}`,
              message: `You got ${gradeText}. ${emoji ? emoji + ' ' : ''}${praiseFor(reaction)}`.trim(),
              metadata: { assignment_id: params.id },
            }).catch((e) => console.error('assignment_reviewed bell notify failed:', e));
          }

          // Marks feed the leaderboard: up to 20 pts scaled by the score, awarded
          // once per assignment (first completed review). Redo requests award none.
          if (reviewAction === 'complete' && finalMarks != null && assignment.max_marks > 0) {
            const pts = Math.round((finalMarks / assignment.max_marks) * 20);
            recordGamificationEvent({
              student_id: studentId,
              classroom_id: assignment.classroom_id,
              batch_id: null,
              event_type: 'assignment_reviewed',
              points: pts,
              source_id: params.id,
              activity_type: 'assignment_reviewed',
              activity_title: `Marked: ${assignment.title}`,
              metadata: {
                assignment_id: params.id,
                marks: finalMarks,
                teacher_marks: marks,
                auto_marks: autoMarks,
                max_marks: assignment.max_marks,
              },
            }).catch((e) => console.error('assignment_reviewed points failed:', e));
          }
        }
        return NextResponse.json({ submission: reviewed, auto_marks: autoMarks });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    return errorResponse(err, 'Failed to save');
  }
}

/** DELETE /api/assignments/[id]  (staff) - draft or zero-submission only. */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    if (!isStaff(user)) throw new ApiError('Not authorized', 403);
    const { rows } = await getAssignmentRoster(params.id);
    const hasSubmissions = rows.some((r) => r.submission);
    const assignment = await getAssignment(params.id);
    if (assignment && assignment.status !== 'draft' && hasSubmissions) {
      return NextResponse.json(
        { error: 'Cannot delete an assignment that already has submissions. Close it instead.' },
        { status: 400 },
      );
    }
    await deleteAssignment(params.id);
    // Clean up the orphan backing drawing question (FK is ON DELETE SET NULL, so
    // deleting the assignment does not cascade to it).
    if (assignment && (assignment as any).assignment_type === 'drawing' && (assignment as any).drawing_question_id) {
      await deleteDrawingQuestion((assignment as any).drawing_question_id).catch((e) =>
        console.error('deleteDrawingQuestion cleanup failed:', e),
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 'Failed to delete');
  }
}
