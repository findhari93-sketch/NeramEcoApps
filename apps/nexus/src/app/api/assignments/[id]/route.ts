import { NextRequest, NextResponse } from 'next/server';
import {
  getAssignment,
  getAssignmentDetail,
  getAssignmentRoster,
  updateAssignment,
  addAssignmentAttachments,
  removeAssignmentAttachment,
  attachTopicDrills,
  reviewSubmission,
  getSubmission,
  signSubmissionFiles,
  deleteAssignment,
  getUserEnrollment,
} from '@neram/database';
import { getRequestUser, isStaff } from '@/lib/study-materials';
import { errorResponse, ApiError } from '@/lib/api-errors';
import { notifyAssignmentPublished, notifyAssignmentReviewed } from '@/lib/timetable-notifications';

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

    const submission = await getSubmission(params.id, user.id);
    const signed = submission
      ? { ...submission, files: await signSubmissionFiles(submission.files || []) }
      : null;
    return NextResponse.json({ assignment: detail, submission: signed, role: 'student' });
  } catch (err) {
    return errorResponse(err, 'Failed to load assignment');
  }
}

/**
 * POST /api/assignments/[id]  (staff)
 * body { action: 'update', ...fields }
 * body { action: 'publish' } | { action: 'close' }
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
          updates.submission_format = body.submission_format === 'pdf' ? 'pdf' : 'pdf_or_image';
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
        const updated = await updateAssignment(params.id, updates);
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
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 'Failed to delete');
  }
}
