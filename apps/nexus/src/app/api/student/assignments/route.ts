import { NextRequest, NextResponse } from 'next/server';
import {
  getAssignment,
  getUserEnrollment,
  getSubmission,
  createSubmissionUploadUrls,
  upsertSubmission,
} from '@neram/database';
import type { NexusAssignmentSubmissionFile } from '@neram/database';
import { getRequestUser } from '@/lib/study-materials';
import { errorResponse, ApiError } from '@/lib/api-errors';
import { validateSubmissionFormat } from '@/lib/assignment-format';

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
  return { user, assignment };
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
        const { user, assignment } = await loadStudentAndAssignment(request, body.assignment_id);
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
        return NextResponse.json({ submission });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    return errorResponse(err, 'Failed to submit');
  }
}
