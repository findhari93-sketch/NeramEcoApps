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
  recordGamificationEvent,
  resolveAssignmentRecording,
  getStudentAssignmentDrawing,
  updateDrawingQuestion,
  deleteDrawingQuestion,
} from '@neram/database';
import { getRequestUser, isStaff } from '@/lib/study-materials';
import { errorResponse, ApiError } from '@/lib/api-errors';
import { notifyAssignmentPublished, notifyAssignmentReviewed } from '@/lib/timetable-notifications';

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
        return NextResponse.json({ assignment: detail, drawing_roster: rows, counts, role: 'staff' });
      }

      const { rows } = await getAssignmentRoster(params.id);
      const rosterWithUrls = await Promise.all(
        rows.map(async (r) => ({
          ...r,
          submission: r.submission
            ? { ...r.submission, files: await signSubmissionFiles(r.submission.files || []) }
            : null,
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
      return NextResponse.json({ assignment: detail, roster: rosterWithUrls, counts, role: 'staff' });
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
      const drawing = await getStudentAssignmentDrawing(user.id, params.id);
      return NextResponse.json({
        assignment: detail,
        drawing_submission: drawing,
        enrolled_at: (enrollment as any)?.enrolled_at ?? null,
        recording,
        role: 'student',
      });
    }

    const submission = await getSubmission(params.id, user.id);
    const signed = submission
      ? { ...submission, files: await signSubmissionFiles(submission.files || []) }
      : null;
    return NextResponse.json({
      assignment: detail,
      submission: signed,
      enrolled_at: (enrollment as any)?.enrolled_at ?? null,
      recording,
      role: 'student',
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
        if (body.due_at !== undefined) updates.due_at = body.due_at || null;
        if (body.class_date !== undefined) updates.class_date = body.class_date;
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

      case 'review_submission': {
        if (!body.submission_id) {
          return NextResponse.json({ error: 'submission_id is required' }, { status: 400 });
        }
        const reviewAction = body.review_action === 'redo' ? 'redo' : 'complete';
        let marks: number | null = null;
        if (body.marks !== null && body.marks !== undefined && body.marks !== '') {
          const m = Number(body.marks);
          if (!Number.isFinite(m) || m < 0 || m > assignment.max_marks) {
            return NextResponse.json(
              { error: `Marks must be between 0 and ${assignment.max_marks}.` },
              { status: 400 },
            );
          }
          marks = m;
        }
        const submission = await getSubmission(params.id, body.student_id ?? '');
        const reviewed = await reviewSubmission(body.submission_id, {
          marks,
          feedback: body.feedback ? String(body.feedback) : null,
          action: reviewAction,
          reviewed_by: user.id,
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

          // Marks feed the leaderboard: up to 20 pts scaled by the score, awarded
          // once per assignment (first completed review). Redo requests award none.
          if (reviewAction === 'complete' && marks != null && assignment.max_marks > 0) {
            const pts = Math.round((marks / assignment.max_marks) * 20);
            recordGamificationEvent({
              student_id: studentId,
              classroom_id: assignment.classroom_id,
              batch_id: null,
              event_type: 'assignment_reviewed',
              points: pts,
              source_id: params.id,
              activity_type: 'assignment_reviewed',
              activity_title: `Marked: ${assignment.title}`,
              metadata: { assignment_id: params.id, marks, max_marks: assignment.max_marks },
            }).catch((e) => console.error('assignment_reviewed points failed:', e));
          }
        }
        return NextResponse.json({ submission: reviewed });
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
