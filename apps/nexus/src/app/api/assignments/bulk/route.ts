import { NextRequest, NextResponse } from 'next/server';
import {
  createAssignment,
  createDrawingQuestion,
  createFileRecord,
  getNextSortOrder,
  addAssignmentAttachments,
  ASSIGNMENT_ATTACHMENTS_FOLDER_ID,
} from '@neram/database';
import { getRequestUser, isStaff } from '@/lib/study-materials';
import { errorResponse, ApiError } from '@/lib/api-errors';
import { validateAssignmentJSON } from '@/lib/assignment-bulk-schema';
import { resolveShareUrlToItem } from '@/lib/sharepoint';

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
      const isDrawing = a.assignment_type === 'drawing';
      // Drop a still-embedded base64 image (client should have uploaded it).
      // For drawing rows the reference image doubles as the inline content image.
      const contentImageUrl = isDrawing
        ? a.reference_image_url
        : a.content_image_url && !a.content_image_url.startsWith('data:')
          ? a.content_image_url
          : null;
      // Personal deadline for on-time students = end of the due day (IST).
      const dueAt = a.due_date ? `${a.due_date}T23:59:59+05:30` : null;

      // Drawing rows get a backing (is_active=false) drawing_questions row so the
      // submissions can flow through the Drawing Review channel unchanged.
      let drawingQuestionId: string | null = null;
      if (isDrawing) {
        const q = await createDrawingQuestion({
          question_text: a.instructions || a.title,
          category: a.drawing_category || '3d_composition',
          sub_type: 'assignment',
          reference_images: a.reference_image_url ? [{ url: a.reference_image_url }] : [],
          is_active: false,
        });
        drawingQuestionId = q.id;
      }

      const assignment = await createAssignment({
        classroom_id: classroomId,
        plan_id: planId,
        class_date: a.class_date,
        title: a.title,
        instructions: a.instructions || null,
        assignment_type: isDrawing ? 'drawing' : 'document',
        drawing_question_id: drawingQuestionId,
        submission_format: isDrawing ? 'image' : a.submission_format,
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

      // Document rows may reference an existing OneDrive/SharePoint file by link.
      if (!isDrawing && a.link_url) {
        try {
          const item = await resolveShareUrlToItem(a.link_url);
          const sortOrder = await getNextSortOrder({ files: ASSIGNMENT_ATTACHMENTS_FOLDER_ID });
          const record = await createFileRecord({
            folder_id: ASSIGNMENT_ATTACHMENTS_FOLDER_ID,
            title: item.name.replace(/\.[^.]+$/, ''),
            file_name: item.name,
            file_type: item.mimeType,
            file_size_bytes: item.size,
            sharepoint_item_id: item.id,
            sharepoint_web_url: a.link_url,
            link_url: a.link_url,
            sort_order: sortOrder,
            uploaded_by: user.id,
          });
          await addAssignmentAttachments(assignment.id, [{ study_file_id: record.id }]);
        } catch (e) {
          console.error('bulk link_url attach failed:', e);
        }
      }

      created.push({ id: assignment.id, title: assignment.title });
    }

    return NextResponse.json({ created, skipped, warnings: result.warnings });
  } catch (err) {
    return errorResponse(err, 'Failed to create assignments');
  }
}
