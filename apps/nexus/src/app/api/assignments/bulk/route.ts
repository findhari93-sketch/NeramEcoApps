import { NextRequest, NextResponse } from 'next/server';
import { createAssignment } from '@neram/database';
import { getRequestUser, isStaff } from '@/lib/study-materials';
import { errorResponse, ApiError } from '@/lib/api-errors';
import { validateAssignmentJSON } from '@/lib/assignment-bulk-schema';

/**
 * POST /api/assignments/bulk  (staff)
 * Create one or many assignments from pasted ChatGPT/Gemini JSON. The client
 * validates + lets the teacher edit first; we re-validate here (trust boundary),
 * then insert each as a DRAFT so the teacher publishes deliberately.
 *
 * Body: { classroom_id, plan_id?, assignments: <array or {assignments:[...]}> }
 * Base64 content images must already be uploaded to a URL by the client; any
 * remaining data: URL is dropped (a TEXT column is the wrong home for image bytes).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    if (!isStaff(user)) throw new ApiError('Not authorized', 403);

    const body = await request.json();
    const classroomId = String(body?.classroom_id || '').trim();
    if (!classroomId) return NextResponse.json({ error: 'classroom_id is required' }, { status: 400 });
    const planId = body?.plan_id ? String(body.plan_id) : null;

    const result = validateAssignmentJSON(body?.assignments);
    if (!result.valid && result.assignments.length === 0) {
      return NextResponse.json({ error: result.errors.join(' ') || 'Invalid JSON' }, { status: 400 });
    }

    const created: { id: string; title: string }[] = [];
    const skipped: { title: string; reason: string }[] = [];

    for (const a of result.assignments) {
      // A row missing a title is unusable; skip it (surface why to the teacher).
      if (a.errors.some((e) => e.startsWith('Missing'))) {
        skipped.push({ title: a.title || '(untitled)', reason: 'Missing title' });
        continue;
      }
      // Drop a still-embedded base64 image (client should have uploaded it).
      const contentImageUrl =
        a.content_image_url && !a.content_image_url.startsWith('data:') ? a.content_image_url : null;
      // Personal deadline for on-time students = end of the due day (IST).
      const dueAt = a.due_date ? `${a.due_date}T23:59:59+05:30` : null;

      const assignment = await createAssignment({
        classroom_id: classroomId,
        plan_id: planId,
        class_date: a.class_date,
        title: a.title,
        instructions: a.instructions || null,
        submission_format: a.submission_format,
        max_marks: a.max_marks,
        due_at: dueAt,
        content_image_url: contentImageUrl,
        content_video_url: a.content_video_url,
        links: a.links,
        recording_url: a.recording_url,
        recording_source: a.recording_source,
        catchup_window_days: a.catchup_window_days,
        created_by: user.id,
      });
      created.push({ id: assignment.id, title: assignment.title });
    }

    return NextResponse.json({ created, skipped, warnings: result.warnings });
  } catch (err) {
    return errorResponse(err, 'Failed to create assignments');
  }
}
