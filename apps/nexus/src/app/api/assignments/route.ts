import { NextRequest, NextResponse } from 'next/server';
import { listAssignmentsForClassroom, createAssignment, createDrawingQuestion } from '@neram/database';
import { getRequestUser, assertStaff, isStaff } from '@/lib/study-materials';
import { errorResponse, ApiError } from '@/lib/api-errors';
import { istTodayStr } from '@/lib/assignment-clock';

const FORMATS = ['pdf', 'image', 'pdf_or_image'] as const;
const DRAWING_CATEGORIES = ['2d_composition', '3d_composition', 'kit_sculpture'] as const;
const MAX_REF_IMAGES = 6;

/**
 * Collect valid https reference-image URLs from a create/update body. Accepts the
 * new `reference_image_urls` array and falls back to the legacy single
 * `reference_image_url`. Deduped, trimmed, and capped.
 */
function sanitizeRefUrls(body: any): string[] {
  const raw: unknown[] = Array.isArray(body?.reference_image_urls)
    ? body.reference_image_urls
    : body?.reference_image_url
      ? [body.reference_image_url]
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    const s = String(v || '').trim();
    if (/^https?:\/\//i.test(s) && !seen.has(s)) {
      seen.add(s);
      out.push(s);
      if (out.length >= MAX_REF_IMAGES) break;
    }
  }
  return out;
}

/**
 * GET /api/assignments?classroom=<id>[&status=draft|published|closed]  (staff)
 * Classroom-anchored assignment list for the Assignments hub, newest class first,
 * each with attachment + submission counts.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);
    const classroomId = request.nextUrl.searchParams.get('classroom');
    if (!classroomId) return NextResponse.json({ error: 'classroom is required' }, { status: 400 });
    const status = request.nextUrl.searchParams.get('status') as
      | 'draft'
      | 'published'
      | 'closed'
      | null;
    const assignments = await listAssignmentsForClassroom(
      classroomId,
      status ? { status } : undefined,
    );
    return NextResponse.json({ assignments });
  } catch (err) {
    return errorResponse(err, 'Failed to load assignments');
  }
}

/**
 * POST /api/assignments  (staff) — manual type-aware create, returns a DRAFT.
 * Body: { action: 'create', classroom_id, assignment_type: 'drawing'|'document',
 *         title, instructions?, class_date?, due_date?(YYYY-MM-DD), catchup_window_days?,
 *         recording_url?, recording_source?,
 *         // drawing only:  reference_image_url?, drawing_category?
 *         // document only: submission_format? }
 *
 * A drawing assignment also gets a backing (is_active=false) drawing_questions row
 * so its submissions can flow through the Drawing Review channel unchanged.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    if (!isStaff(user)) throw new ApiError('Not authorized', 403);
    const body = await request.json();
    if (body?.action !== 'create') throw new ApiError('Unknown action', 400);

    const classroomId = String(body?.classroom_id || '').trim();
    if (!classroomId) throw new ApiError('classroom_id is required', 400);
    const title = String(body?.title || '').trim();
    if (!title) throw new ApiError('Give the assignment a title.', 400);

    const type = body?.assignment_type === 'drawing' ? 'drawing' : 'document';
    const instructions = body?.instructions ? String(body.instructions).trim() : null;

    let classDate = String(body?.class_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(classDate)) classDate = istTodayStr();
    // Personal deadline for on-time students = end of the due day (IST).
    const dueDate = String(body?.due_date || '').slice(0, 10);
    const dueAt = /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? `${dueDate}T23:59:59+05:30` : null;

    let windowDays = Number(body?.catchup_window_days ?? 7);
    if (!Number.isFinite(windowDays) || windowDays < 0) windowDays = 7;

    let recordingUrl: string | null = null;
    let recordingSource: 'youtube' | 'sharepoint' | null = null;
    if (body?.recording_url && /^https?:\/\//i.test(String(body.recording_url))) {
      recordingUrl = String(body.recording_url).trim();
      recordingSource =
        body.recording_source === 'youtube' || body.recording_source === 'sharepoint'
          ? body.recording_source
          : /youtube\.com|youtu\.be/i.test(recordingUrl)
            ? 'youtube'
            : 'sharepoint';
    }

    // Grading scale (teacher's choice): 'marks' out of max_marks, or 'stars' (1-5).
    // Default by type: drawings start on stars, documents on marks. Stars are stored
    // against a max of 5.
    const evaluationType: 'marks' | 'stars' =
      body?.evaluation_type === 'stars'
        ? 'stars'
        : body?.evaluation_type === 'marks'
          ? 'marks'
          : type === 'drawing'
            ? 'stars'
            : 'marks';
    const maxMarks = evaluationType === 'stars' ? 5 : Number(body?.max_marks) > 0 ? Number(body.max_marks) : 10;

    let drawingQuestionId: string | null = null;
    let submissionFormat: 'pdf' | 'image' | 'pdf_or_image';
    let contentImageUrl: string | null = null;

    if (type === 'drawing') {
      submissionFormat = 'image'; // drawings are photos-only
      const category = DRAWING_CATEGORIES.includes(body?.drawing_category)
        ? body.drawing_category
        : '3d_composition';
      const refUrls = sanitizeRefUrls(body);
      // Keep the first image on the assignment too (thumbnail + back-compat); the
      // full set lives on the backing question's reference_images array.
      contentImageUrl = refUrls[0] ?? null;
      const question = await createDrawingQuestion({
        question_text: instructions || title,
        category,
        sub_type: 'assignment',
        reference_images: refUrls.map((url) => ({ url })),
        is_active: false,
      });
      drawingQuestionId = question.id;
    } else {
      submissionFormat = FORMATS.includes(body?.submission_format) ? body.submission_format : 'pdf_or_image';
    }

    const assignment = await createAssignment({
      classroom_id: classroomId,
      class_date: classDate,
      title,
      instructions,
      assignment_type: type,
      drawing_question_id: drawingQuestionId,
      content_image_url: contentImageUrl,
      submission_format: submissionFormat,
      evaluation_type: evaluationType,
      max_marks: maxMarks,
      due_at: dueAt,
      catchup_window_days: Math.round(windowDays),
      recording_url: recordingUrl,
      recording_source: recordingSource,
      created_by: user.id,
    });

    return NextResponse.json({ assignment });
  } catch (err) {
    return errorResponse(err, 'Failed to create assignment');
  }
}
