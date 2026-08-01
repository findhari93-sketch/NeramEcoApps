import { NextRequest, NextResponse } from 'next/server';
import {
  listAssignmentsForClassroom,
  createAssignment,
  createDrawingQuestion,
  getSupabaseAdminClient,
} from '@neram/database';
import { getRequestUser, assertStaff, isStaff } from '@/lib/study-materials';
import { errorResponse, ApiError } from '@/lib/api-errors';
import { istTodayStr } from '@/lib/assignment-clock';
import { classStartIso } from '@/lib/prework';
import { composeDrawingBriefText } from '@/lib/drawing-brief-text';

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
 *
 * Rows created from the timetable also carry the class they belong to, so the
 * hub can separate work that was set in a session from standalone work. That
 * split is what tells a late joiner which classes they still owe.
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

    // Resolved here rather than in the shared query, because touching
    // packages/database rebuilds all four apps for a label on one page.
    const withClass = await attachClassLabels(assignments as any[]);

    return NextResponse.json({ assignments: withClass });
  } catch (err) {
    return errorResponse(err, 'Failed to load assignments');
  }
}

/** One batched lookup for the class titles, whatever the assignment count. */
async function attachClassLabels(rows: any[]): Promise<any[]> {
  const ids = [...new Set(rows.map((a) => a.scheduled_class_id).filter(Boolean))] as string[];
  if (ids.length === 0) return rows;

  const supabase = getSupabaseAdminClient() as any;
  const { data } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, title, scheduled_date, start_time')
    .in('id', ids);

  const byId = new Map<string, any>((data || []).map((c: any) => [c.id, c]));
  return rows.map((a) =>
    a.scheduled_class_id && byId.has(a.scheduled_class_id)
      ? { ...a, scheduled_class: byId.get(a.scheduled_class_id) }
      : a,
  );
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
    // The brief's other two parts. Optional, and empty stays NULL rather than
    // becoming an empty labelled block on the student's screen.
    const expectedOutcome = body?.expected_outcome ? String(body.expected_outcome).trim() || null : null;
    const focusPoints = body?.focus_points ? String(body.focus_points).trim() || null : null;

    // When created from the timetable, the assignment is pinned to the class it
    // was given in and inherits that class's date, so the two can never drift.
    const scheduledClassId = String(body?.scheduled_class_id || '').trim() || null;

    // Pre-class work is due when its class starts, so its deadline is derived,
    // never typed. Homework keeps the end-of-day deadline the teacher picks.
    const timing: 'prework' | 'homework' = body?.timing === 'prework' ? 'prework' : 'homework';

    let classDate = String(body?.class_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(classDate)) classDate = istTodayStr();
    // Personal deadline for on-time students = end of the due day (IST).
    const dueDate = String(body?.due_date || '').slice(0, 10);
    let dueAt = /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? `${dueDate}T23:59:59+05:30` : null;

    if (timing === 'prework' && scheduledClassId) {
      const { data: cls } = await (getSupabaseAdminClient() as any)
        .from('nexus_scheduled_classes')
        .select('scheduled_date, start_time')
        .eq('id', scheduledClassId)
        .maybeSingle();
      if (!cls) throw new ApiError('That class no longer exists.', 404);
      dueAt = classStartIso(cls.scheduled_date, cls.start_time || '00:00');
      // Never date the work into the future: class_date drives the student's
      // personal clock and the sort order of their assignment list.
      const today = istTodayStr();
      classDate = cls.scheduled_date > today ? today : cls.scheduled_date;
    }

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
        // The whole brief, not just the task: "focus on" is exactly what the
        // reviewer should be marking against, and it used to never reach them.
        question_text: composeDrawingBriefText(
          { instructions, expected_outcome: expectedOutcome, focus_points: focusPoints },
          title,
        ),
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
      scheduled_class_id: scheduledClassId,
      timing,
      class_date: classDate,
      title,
      instructions,
      expected_outcome: expectedOutcome,
      focus_points: focusPoints,
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
