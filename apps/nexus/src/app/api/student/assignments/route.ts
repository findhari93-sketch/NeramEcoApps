import { NextRequest, NextResponse } from 'next/server';
import {
  getAssignment,
  getUserEnrollment,
  getSubmission,
  createSubmissionUploadUrls,
  upsertSubmission,
  recordGamificationEvent,
  recordPointEvent,
  listActiveEnrolledClassrooms,
  listAssignmentsForStudent,
} from '@neram/database';
import type { NexusAssignmentSubmissionFile } from '@neram/database';
import { getRequestUser } from '@/lib/study-materials';
import { errorResponse, ApiError } from '@/lib/api-errors';
import { validateSubmissionFormat } from '@/lib/assignment-format';
import { isSubmissionOnTime } from '@/lib/assignment-clock';

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60);
}

async function loadStudentAndAssignment(request: NextRequest, assignmentId: string) {
  const user = await getRequestUser(request.headers.get('Authorization'));
  const assignment = await getAssignment(assignmentId);
  if (!assignment) throw new ApiError('Assignment not found', 404);
  if (assignment.status !== 'published') throw new ApiError('This assignment is not available.', 403);
  const enrollment = await getUserEnrollment(user.id, assignment.classroom_id);
  if (!enrollment) throw new ApiError('You are not enrolled in this class.', 403);
  return { user, assignment, enrollment };
}

/**
 * Award submission points on the student's PERSONAL clock so late joiners are
 * ranked fairly. Idempotent per (student, event, assignment): resubmits never
 * double-count. Best-effort: failures never block the submission.
 */
async function awardSubmissionPoints(
  assignment: any,
  studentId: string,
  batchId: string | null,
  submittedAtIso: string,
  enrolledAt: string | null,
) {
  try {
    await recordGamificationEvent({
      student_id: studentId,
      classroom_id: assignment.classroom_id,
      batch_id: batchId,
      event_type: 'assignment_submitted',
      points: 10,
      source_id: assignment.id,
      activity_type: 'assignment_submitted',
      activity_title: `Submitted: ${assignment.title}`,
      metadata: { assignment_id: assignment.id },
    });
    const onTime = isSubmissionOnTime(
      {
        class_date: assignment.class_date,
        enrolled_at: enrolledAt,
        due_at: assignment.due_at,
        catchup_window_days: assignment.catchup_window_days ?? 7,
      },
      submittedAtIso,
    );
    if (onTime) {
      await recordPointEvent({
        student_id: studentId,
        classroom_id: assignment.classroom_id,
        batch_id: batchId,
        event_type: 'assignment_ontime',
        points: 15,
        source_id: assignment.id,
        metadata: { assignment_id: assignment.id },
      });
    }
  } catch (e) {
    console.error('awardSubmissionPoints failed:', e);
  }
}

/**
 * GET /api/student/assignments
 * The student's published assignments across their active classrooms, each with
 * their submission, enrolment date (for the personal clock) and a resolved class
 * recording. Flattened and sorted newest class first.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    const classrooms = await listActiveEnrolledClassrooms(user.id);
    const perClassroom = await Promise.all(
      classrooms.map((c) => listAssignmentsForStudent(user.id, c.id)),
    );
    const classroomById = new Map(classrooms.map((c) => [c.id, c]));
    const assignments = perClassroom
      .flat()
      .map((a) => ({ ...a, classroom_name: classroomById.get(a.classroom_id)?.name ?? null }))
      .sort((a, b) => (a.class_date < b.class_date ? 1 : a.class_date > b.class_date ? -1 : 0));
    return NextResponse.json({ assignments });
  } catch (err) {
    return errorResponse(err, 'Failed to load assignments');
  }
}

/**
 * POST /api/student/assignments
 * body { action: 'create_upload_urls', assignment_id, files: [{name, mime, size_bytes}] }
 *   -> returns signed upload URLs so the browser PUTs bytes directly to storage.
 * body { action: 'submit', assignment_id, files: [{path, name, mime, size_bytes}] }
 *   -> records the submission (or resubmits, keeping attempt history).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.assignment_id) {
      return NextResponse.json({ error: 'assignment_id is required' }, { status: 400 });
    }

    switch (body.action) {
      case 'create_upload_urls': {
        const { user, assignment } = await loadStudentAndAssignment(request, body.assignment_id);
        const files: { name: string; mime: string; size_bytes?: number }[] = body.files || [];
        const formatError = validateSubmissionFormat(assignment.submission_format, files);
        if (formatError) return NextResponse.json({ error: formatError }, { status: 400 });

        const existing = await getSubmission(body.assignment_id, user.id);
        const attempt = existing ? existing.attempt_number + 1 : 1;
        const ts = Date.now();
        const paths = files.map(
          (f, i) => `${body.assignment_id}/${user.id}/attempt-${attempt}/${ts}-${i}-${sanitize(f.name)}`,
        );
        const uploads = await createSubmissionUploadUrls(paths);
        // Pair each signed URL back with the declared metadata for the submit call.
        const result = uploads.map((u, i) => ({
          path: u.path,
          token: u.token,
          signedUrl: u.signedUrl,
          name: files[i].name,
          mime: files[i].mime,
          size_bytes: files[i].size_bytes ?? 0,
        }));
        return NextResponse.json({ uploads: result });
      }

      case 'submit': {
        const { user, assignment, enrollment } = await loadStudentAndAssignment(request, body.assignment_id);
        const files: NexusAssignmentSubmissionFile[] = (body.files || []).map((f: any) => ({
          path: String(f.path),
          name: String(f.name),
          mime: String(f.mime),
          size_bytes: Number(f.size_bytes) || 0,
        }));
        const formatError = validateSubmissionFormat(assignment.submission_format, files);
        if (formatError) return NextResponse.json({ error: formatError }, { status: 400 });
        // Guard: every path must live under this student's own prefix.
        const prefix = `${body.assignment_id}/${user.id}/`;
        if (files.some((f) => !f.path.startsWith(prefix))) {
          return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
        }
        const submission = await upsertSubmission(body.assignment_id, user.id, files);
        await awardSubmissionPoints(
          assignment,
          user.id,
          (enrollment as any)?.batch_id ?? null,
          submission.submitted_at,
          (enrollment as any)?.enrolled_at ?? null,
        );
        return NextResponse.json({ submission });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    return errorResponse(err, 'Failed to submit');
  }
}
