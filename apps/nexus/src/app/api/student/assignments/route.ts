import { NextRequest, NextResponse } from 'next/server';
import {
  getAssignment,
  getUserEnrollment,
  getSubmission,
  createSubmissionUploadUrls,
  removeSubmissionFiles,
  upsertSubmission,
  recordGamificationEvent,
  recordPointEvent,
  listActiveEnrolledClassrooms,
  listAssignmentsForStudent,
  getAssignmentPaper,
  getAssignmentAttempt,
  startOrResumeAttempt,
  submitAttempt,
} from '@neram/database';
import type { NexusAssignmentSubmissionFile } from '@neram/database';
import { getRequestUser } from '@/lib/study-materials';
import { errorResponse, ApiError } from '@/lib/api-errors';
import { validateSubmissionFormat } from '@/lib/assignment-format';
import { isSubmissionOnTime } from '@/lib/assignment-clock';
import { resolveSubmitMode, lockedReason, type SubmitMode } from '@/lib/assignment-submit-window';

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
 * Whether this student may hand work in right now, and what that hand-in means.
 *
 * Called by BOTH actions on purpose. Checking only at 'submit' would hand out
 * signed upload URLs for work that is then refused, so the student would burn a
 * slow mobile upload before hearing no. Checking only at 'create_upload_urls'
 * would leave the write itself unguarded, which is how this route previously
 * accepted a replayed submit over marked work and cleared the marks with it.
 */
async function resolveWindow(
  assignment: any,
  enrollment: any,
  studentId: string,
): Promise<{ mode: SubmitMode; existing: Awaited<ReturnType<typeof getSubmission>> }> {
  const existing = await getSubmission(assignment.id, studentId);
  const mode = resolveSubmitMode(
    existing,
    {
      class_date: assignment.class_date,
      enrolled_at: enrollment?.enrolled_at ?? null,
      due_at: assignment.due_at,
      catchup_window_days: assignment.catchup_window_days ?? 7,
    },
    new Date().toISOString(),
  );
  if (mode === 'locked') throw new ApiError(lockedReason(existing), 403);
  return { mode, existing };
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
        const { user, assignment, enrollment } = await loadStudentAndAssignment(request, body.assignment_id);
        const files: { name: string; mime: string; size_bytes?: number }[] = body.files || [];
        const formatError = validateSubmissionFormat(assignment.submission_format, files);
        if (formatError) return NextResponse.json({ error: formatError }, { status: 400 });

        const { existing } = await resolveWindow(assignment, enrollment, user.id);
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

        const { mode, existing } = await resolveWindow(assignment, enrollment, user.id);
        const supersededPaths =
          mode === 'replace' ? (existing?.files || []).map((f) => f.path) : [];

        const submission = await upsertSubmission(
          body.assignment_id,
          user.id,
          files,
          mode === 'replace' ? 'replace' : 'attempt',
        );

        // Best effort, and after the write on purpose: a correction that saved
        // but left an orphan blob behind is fine, a correction lost because the
        // cleanup threw is not.
        if (supersededPaths.length) {
          removeSubmissionFiles(supersededPaths).catch((e) =>
            console.error('removeSubmissionFiles failed:', e),
          );
        }

        await awardSubmissionPoints(
          assignment,
          user.id,
          (enrollment as any)?.batch_id ?? null,
          submission.submitted_at,
          (enrollment as any)?.enrolled_at ?? null,
        );
        return NextResponse.json({ submission });
      }

      /**
       * Answer the assignment's questions. One shot, then results.
       *
       * Two gates before anything is graded, and the order they run in is the
       * design:
       *
       *  1. If the assignment wants worked solutions, the PDF must already be
       *     in. Results are instant, so a student who could answer first would
       *     see the correct values and then write "working" to match them.
       *  2. Answers submit once. That is what earns the instant reveal: a second
       *     go after seeing the key is just copying.
       */
      case 'submit_answers': {
        const { user, assignment, enrollment } = await loadStudentAndAssignment(request, body.assignment_id);

        const paper = await getAssignmentPaper(body.assignment_id, false);
        if (!paper || paper.questions.length === 0) {
          return NextResponse.json({ error: 'This assignment has no questions.' }, { status: 400 });
        }

        // `!== false`, not truthiness: the column defaults to true, and on a
        // database that has not run the migration it is simply absent. Requiring
        // the upload is the safe reading of "we do not know".
        if ((assignment as any).requires_pdf !== false) {
          const existing = await getSubmission(body.assignment_id, user.id);
          if (!existing || !(existing.files || []).length) {
            return NextResponse.json(
              {
                error: 'Upload your worked solutions first, then answer the questions.',
                code: 'PDF_REQUIRED',
              },
              { status: 409 },
            );
          }
        }

        const already = await getAssignmentAttempt(paper.test_id, user.id);
        if (already) {
          return NextResponse.json(
            { error: 'Your answers are already in and cannot be changed.', code: 'ANSWERS_LOCKED' },
            { status: 409 },
          );
        }

        // Only answers to questions actually on this paper, as strings. Anything
        // else is either stale or somebody probing.
        const allowed = new Set(paper.questions.map((q) => q.id));
        const answers: Record<string, string> = {};
        for (const [qid, value] of Object.entries(body.answers || {})) {
          if (allowed.has(qid) && value != null) answers[qid] = String(value);
        }

        const { attempt } = await startOrResumeAttempt({
          testId: paper.test_id,
          studentId: user.id,
          placementId: paper.placement_id,
        });
        const graded = await submitAttempt({ attemptId: attempt.id, studentId: user.id, answers });

        // A paper with no PDF half still has to leave a submission behind, or
        // the roster would show the student as missing while their marked
        // answers sat in an attempt row nobody joins to.
        if ((assignment as any).requires_pdf === false) {
          const existing = await getSubmission(body.assignment_id, user.id);
          if (!existing) {
            const submission = await upsertSubmission(body.assignment_id, user.id, []);
            await awardSubmissionPoints(
              assignment,
              user.id,
              (enrollment as any)?.batch_id ?? null,
              submission.submitted_at,
              (enrollment as any)?.enrolled_at ?? null,
            );
          }
        }

        return NextResponse.json({
          result: {
            score: graded.score,
            total_marks: graded.total_marks,
            percentage: graded.percentage,
            review: graded.review,
          },
          manual_marks: paper.manual_marks,
        });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    return errorResponse(err, 'Failed to submit');
  }
}
