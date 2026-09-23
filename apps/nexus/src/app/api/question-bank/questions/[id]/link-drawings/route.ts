import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import {
  createDrawingQuestionFromQB,
  getLinkedDrawingQuestionId,
  PRACTICE_SOURCE_TYPES,
} from '@neram/database/queries/nexus';
import { getSupabaseAdminClient } from '@neram/database';
import { describeError } from '@/lib/api-errors';

/**
 * Filing drawings students already made under the bank question they answer.
 *
 * Students have been drawing past paper questions since long before the bank
 * could say so. Those sheets sit in sketchbooks with no question attached, so
 * "see how others drew this" finds nothing on questions several people have
 * actually drawn. A teacher who recognises the work is the only one who can
 * say which question it was, so this is a teacher tool and not a guess.
 *
 * THE WRITE IS ONE COLUMN
 *
 * drawing_submissions.question_id, pointed at the mirror drawing_questions row
 * for this bank question (minted here if it does not exist yet). The
 * Inspiration sync trigger fires on that column and fills source_qb_question_id
 * by itself, so the drawing appears under the question with no second write and
 * no chance of the two disagreeing.
 *
 * WHAT IS NEVER TOUCHED
 *
 * Anything with an assignment or from an exam. An assignment drawing's
 * question_id is how the assignment finds its own work, and an exam drawing is
 * embargoed until results are out. Both are excluded by the query, not by the
 * screen, because a screen can be driven by anything.
 */

const MAX_LINK = 60;

/**
 * A drawing the teacher could file under this question.
 *
 * `!inner` when a name is being searched, so the filter and the row limit are
 * both applied by the database. Filtering the first page in JavaScript would
 * search the newest forty drawings and quietly call that "no results".
 */
const candidateColumns = (search: boolean) =>
  'id, student_id, original_image_url, thumbnail_url, source_type, submitted_at, question_id, ' +
  `student:users!drawing_submissions_student_id_fkey${search ? '!inner' : ''}(id, name, avatar_url)`;

/**
 * GET: practice drawings a teacher might file here, newest first.
 *
 * `?q=` filters by student name. ILIKE rather than eq: PostgREST's eq is case
 * sensitive and a teacher typing a first name in lower case would find nobody.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: questionId } = await params;
    const access = await verifyQBStaff(request.headers.get('Authorization'));
    if (!access.ok) return access.response;

    const url = request.nextUrl.searchParams;
    const search = (url.get('q') || '').trim();
    const partId = url.get('part') || '';
    const limit = Math.min(Math.max(Number(url.get('limit')) || 40, 1), MAX_LINK);

    const supabase = getSupabaseAdminClient() as any;
    const mirrorId = await getLinkedDrawingQuestionId(questionId, partId);

    let query = supabase
      .from('drawing_submissions')
      .select(candidateColumns(search.length > 0))
      .in('source_type', [...PRACTICE_SOURCE_TYPES])
      .is('assignment_id', null)
      .order('submitted_at', { ascending: false })
      .limit(limit);

    if (search) query = query.ilike('student.name', `%${search}%`);
    // Already filed here, so there is nothing to do with it.
    if (mirrorId) query = query.neq('question_id', mirrorId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(
      { data: { items: data || [], linked_to: mirrorId } },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('[QB link drawings] Error:', describeError(err));
    return NextResponse.json({ error: 'Could not load drawings' }, { status: 500 });
  }
}

/** POST: file the chosen drawings under this question, or one option of it. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: questionId } = await params;
    const access = await verifyQBStaff(request.headers.get('Authorization'));
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => ({}));
    const { submission_ids, part } = body as { submission_ids?: unknown; part?: string | null };
    const ids = Array.isArray(submission_ids)
      ? submission_ids.filter((v): v is string => typeof v === 'string' && v.length > 0)
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: 'Choose at least one drawing.' }, { status: 400 });
    }
    if (ids.length > MAX_LINK) {
      return NextResponse.json(
        { error: `That is more than ${MAX_LINK} drawings at once.` },
        { status: 400 },
      );
    }

    const partId = part || '';
    let mirrorId = await getLinkedDrawingQuestionId(questionId, partId);
    if (!mirrorId) mirrorId = await createDrawingQuestionFromQB(questionId, partId);
    if (!mirrorId) {
      return NextResponse.json(
        { error: 'This question has no practice question behind it yet. Activate its paper first.' },
        { status: 409 },
      );
    }

    const supabase = getSupabaseAdminClient() as any;
    const { data, error } = await supabase
      .from('drawing_submissions')
      // question_id only. source_type is deliberately left alone: a daily
      // sketch relabelled 'question_bank' would lose the guard that stops a
      // teacher's mark-up of a private sketch being auto-published
      // (nexus_inspiration_no_auto_publish_of_practice reads source_type), and
      // it would change what the drawing is called on every screen a student
      // sees. It answers a bank question; it is still their sketch.
      .update({ question_id: mirrorId })
      .in('id', ids)
      // The guard lives here and not only on the screen: an assignment's
      // drawing needs its own question_id, and an exam drawing is embargoed.
      .in('source_type', [...PRACTICE_SOURCE_TYPES])
      .is('assignment_id', null)
      .select('id');
    if (error) throw error;

    const linked = (data || []).length;
    return NextResponse.json({
      data: { linked, skipped: ids.length - linked, drawing_question_id: mirrorId },
    });
  } catch (err) {
    console.error('[QB link drawings] Error:', describeError(err));
    return NextResponse.json({ error: 'Could not link those drawings' }, { status: 500 });
  }
}
