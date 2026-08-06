import { NextRequest, NextResponse } from 'next/server';
import { refuseUnlessStudent, verifyQBAccess } from '@/lib/qb-auth';
import { composeTest, getTestFolderById, type NexusTestSourceFilters } from '@neram/database';
import { MAX_STUDENT_TEST_QUESTIONS, studentTestSizeMessage } from '@/lib/test-limits';

/** Cap on any single stored filter array, so a crafted body cannot bloat the row. */
const MAX_FILTER_VALUES = 50;
/** Cap on stored free text, matching the search box's practical length. */
const MAX_SEARCH_TEXT = 200;

const asStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((v): v is string => typeof v === 'string' && v.length > 0).slice(0, MAX_FILTER_VALUES);
  return out.length > 0 ? out : undefined;
};

const asString = (value: unknown, max = 120): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, max) : undefined;

/**
 * Normalise the filter state the builder sends alongside its question ids.
 *
 * Sanitised rather than trusted: this lands in a jsonb column that staff read,
 * so it is shaped to a known set of keys with bounded sizes instead of storing
 * whatever the client posted.
 *
 * Returns undefined when the client sent nothing at all, which is how a request
 * from an older client stays distinguishable from one where the student
 * genuinely had no filters set. The first must store NULL; the second stores
 * `{ selection: 'manual' }`, and those mean different things to a teacher.
 */
function readSourceFilters(raw: unknown): NexusTestSourceFilters | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const f = raw as Record<string, unknown>;

  const year = Number(f.year);
  const matched = Number(f.matched_count);

  const out: NexusTestSourceFilters = {
    exam_type: asString(f.exam_type) ?? null,
    year: Number.isFinite(year) && year > 0 ? Math.trunc(year) : null,
    session: asString(f.session) ?? null,
    categories: asStringArray(f.categories),
    difficulty: asStringArray(f.difficulty),
    question_format: asStringArray(f.question_format),
    topic_ids: asStringArray(f.topic_ids),
    attempt_status: asString(f.attempt_status) ?? null,
    search_text: asString(f.search_text, MAX_SEARCH_TEXT) ?? null,
    selection: f.selection === 'select_all' ? 'select_all' : 'manual',
    matched_count: Number.isFinite(matched) && matched >= 0 ? Math.trunc(matched) : null,
  };

  // Drop the keys that carry no answer, so a teacher reading the raw row sees
  // only what the student actually set.
  return Object.fromEntries(
    Object.entries(out).filter(([, v]) => v !== null && v !== undefined),
  ) as NexusTestSourceFilters;
}

/**
 * POST /api/question-bank/custom-tests
 * Student creates a custom practice test from QB questions.
 * Thin caller over the shared composeTest core (also used by the teacher builder).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, question_ids, timer_type, duration_minutes, per_question_seconds, classroom_id } = body;

    const access = await verifyQBAccess(request.headers.get('Authorization'), classroom_id);
    if (!access.ok) return access.response;
    const { caller } = access;

    // This row is stamped created_by_student, so the caller has to actually be
    // one. Without this a staff account lands in the teacher hub's student list.
    const notAStudent = refuseUnlessStudent(caller);
    if (notAStudent) return notAStudent;

    // A student may file their paper only in their own tree. Without this check
    // a crafted folder_id would drop a student's test into the staff library.
    let folderId: string | null = null;
    if (typeof body?.folder_id === 'string' && body.folder_id) {
      const folder = await getTestFolderById(body.folder_id);
      if (!folder || folder.owner_scope !== 'student' || folder.owner_id !== caller.id) {
        return NextResponse.json({ error: 'That folder is not yours' }, { status: 403 });
      }
      folderId = folder.id;
    }

    if (!question_ids || !Array.isArray(question_ids) || question_ids.length === 0) {
      return NextResponse.json({ error: 'question_ids must be a non-empty array' }, { status: 400 });
    }
    // The builder has always said "up to 50" and stopped at 50. The question
    // bank's "select all matching" did not, and it fetches up to a thousand ids,
    // which is how a 544-question practice paper got created. The ceiling lives
    // here because only the server can actually hold it.
    if (question_ids.length > MAX_STUDENT_TEST_QUESTIONS) {
      return NextResponse.json({ error: studentTestSizeMessage(question_ids.length) }, { status: 400 });
    }
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const { id } = await composeTest({
      title,
      questionIds: question_ids,
      timerType: timer_type,
      durationMinutes: duration_minutes ?? null,
      perQuestionSeconds: per_question_seconds ?? null,
      isPublished: true, // immediately available to the student
      isRepository: false,
      testKind: 'student_custom',
      createdBy: caller.id,
      createdByStudent: caller.id,
      classroomId: classroom_id ?? null,
      folderId,
      // What the student was looking at when they pressed Create. Every one of
      // the 28 papers built before this shipped has NULL here, because the route
      // accepted a title, question ids and timer settings and dropped the entire
      // filter state, which is why staff could not tell any of them apart.
      sourceFilters: readSourceFilters(body?.source_filters) ?? null,
    });

    return NextResponse.json(
      { data: { test_id: id, title: title.trim(), question_count: question_ids.length } },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create custom test';
    console.error('Custom test POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
