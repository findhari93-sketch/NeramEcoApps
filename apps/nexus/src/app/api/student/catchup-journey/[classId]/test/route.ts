import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  getClassTestForClass,
  getServedTestQuestions,
  nextAttemptNumber,
  gradeTestOneShot,
} from '@neram/database';

/**
 * The final check at the end of a catch-up class recap.
 *
 * The rule used to be "a failed attempt sends you back to the recording before
 * you can try again", enforced by clearing `test_unlocked_at` on a fail. It
 * never once held: clearing that column put the row into exactly the state a
 * read-time self-heal treated as damage, so the unlock came straight back, and
 * `rewatch_count` sat at 0 across the whole table. What the student actually
 * experienced was a screen that looked untouched after they had sat the test.
 *
 * The rule now is simpler and true. One question decides whether the paper is
 * open, asked of live data by isTestOpen: has this student finished the recap.
 * Both verbs ask it, so the paper cannot be handed out by a rule the submit
 * refuses by. A fail costs nothing but the attempt, and the next sitting is a
 * different window of questions.
 *
 * Namespaced under catchup-journey, not catchup: /api/student/catchup is the
 * older topic-level catch-up TRACK (nexus_catchup_tracks, teacher-curated,
 * shared per plan). Different grain, different feature, and nesting these under
 * it would have read as if they belonged to it.
 */

interface Ctx {
  params: { classId: string };
}

interface Resolved {
  userId: string;
  item: any;
  test: { placement_id: string; test_id: string; passing_pct: number; question_count: number };
}

async function resolve(
  supabase: any,
  authorization: string | null,
  classId: string,
): Promise<Resolved | NextResponse> {
  const msUser = await verifyMsToken(authorization);

  const { data: user } = await supabase.from('users').select('id').eq('ms_oid', msUser.oid).single();
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { data: item } = await supabase
    .from('nexus_class_absences')
    .select('id, student_id, scheduled_class_id, test_unlocked_at, test_passed_at, excused_at')
    .eq('scheduled_class_id', classId)
    .eq('student_id', user.id)
    .maybeSingle();
  if (!item) {
    return NextResponse.json({ error: 'This class is not on your catch-up list.' }, { status: 404 });
  }

  const test = await getClassTestForClass(classId, supabase);
  if (!test) {
    return NextResponse.json(
      { error: 'Your teacher has not set the test for this class yet.' },
      { status: 404 },
    );
  }

  return { userId: user.id, item, test };
}

/**
 * Is the paper open for this student right now?
 *
 * Derived from the recap's checkpoints, deliberately, and NOT from
 * `test_unlocked_at`. That column was written once when the last checkpoint was
 * answered and cleared again by a failing grade, and a read-time self-heal then
 * put it back, so the three writers spent their time undoing each other. The
 * question "has this student finished the recap" has an answer in the data at
 * all times, so it is asked directly.
 *
 * Mirrors isCatchupTestAvailable in @neram/database, which is what the workspace
 * screen renders from. Both verbs of this route call this one function, so the
 * paper cannot be served by a rule the submit refuses by.
 *
 * The stamp survives as a fallback only, for a teacher's reset on a class whose
 * recap was later unpublished.
 */
async function isTestOpen(
  supabase: any,
  classId: string,
  studentId: string,
  item: any,
): Promise<boolean> {
  const { data: recap } = await supabase
    .from('nexus_class_recaps')
    .select('id')
    .eq('scheduled_class_id', classId)
    .eq('status', 'published')
    .maybeSingle();

  if (recap?.id) {
    const { data: progress } = await supabase
      .from('nexus_class_recap_progress')
      .select('recap_id')
      .eq('student_id', studentId)
      .eq('recap_id', recap.id)
      .eq('status', 'completed')
      .maybeSingle();
    if (progress) return true;
  }

  return !!item.test_unlocked_at;
}

/**
 * GET /api/student/catchup-journey/[classId]/test
 * The paper, without answers, in this attempt's order.
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const supabase = getSupabaseAdminClient() as any;
    const resolved = await resolve(supabase, request.headers.get('Authorization'), params.classId);
    if (resolved instanceof NextResponse) return resolved;
    const { userId, item, test } = resolved;

    if (!(await isTestOpen(supabase, params.classId, userId, item))) {
      return NextResponse.json(
        {
          error: 'TEST_LOCKED',
          message: 'Finish the class recap to unlock this test.',
        },
        { status: 403 },
      );
    }

    // getServedTestQuestions, not getComposedTestQuestions plus a local shuffle.
    // It runs ensureTestDraw, which PERSISTS this sitting's window and option
    // permutation, and submitAttempt grades against that same stored draw. The
    // old pairing served the whole pool and reshuffled it in this route, which
    // was fine only while the paper and the sitting were the same thing. Now
    // that a sitting is 15 of a larger bank, serving anything the grader did not
    // record would mark the student against questions they were never asked.
    const questions = await getServedTestQuestions(test.test_id, userId, supabase);
    if (questions.length === 0) {
      return NextResponse.json({ error: 'This test has no questions yet.' }, { status: 404 });
    }

    // The same number getServedTestQuestions drew against and that
    // startOrResumeAttempt will record, so "Attempt 2" on screen is attempt 2 in
    // the ledger. Counting rows here instead was off by one the moment an
    // attempt was left open.
    const attemptNumber = await nextAttemptNumber(test.test_id, userId, supabase);

    // Needed so a failing result can send the student straight back into the
    // gated recording rather than making them navigate for it.
    const { data: recap } = await supabase
      .from('nexus_class_recaps')
      .select('id')
      .eq('scheduled_class_id', params.classId)
      .eq('status', 'published')
      .maybeSingle();

    return NextResponse.json({
      recap_id: recap?.id ?? null,
      test: {
        id: test.test_id,
        placement_id: test.placement_id,
        passing_pct: test.passing_pct,
        question_count: questions.length,
        // Stated up front so nobody is surprised by the bar after they submit.
        must_get_right: Math.ceil((test.passing_pct / 100) * questions.length),
      },
      attempt_number: attemptNumber,
      passed: !!item.test_passed_at,
      // Already in this sitting's order, with this sitting's option lettering,
      // because getServedTestQuestions applied the stored draw. Reshuffling here
      // would put the paper out of step with what the grader recorded.
      questions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the test';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/student/catchup-journey/[classId]/test
 * body { answers: Record<questionId, optionId> }
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const supabase = getSupabaseAdminClient() as any;
    const resolved = await resolve(supabase, request.headers.get('Authorization'), params.classId);
    if (resolved instanceof NextResponse) return resolved;
    const { userId, item, test } = resolved;

    // Re-read rather than trusting the row loaded a moment ago, and check with
    // the SAME function the GET admitted them by. These two used to disagree:
    // GET let a passed student open the paper while POST refused to grade it,
    // so the only way to find out was to answer everything first.
    const { data: fresh } = await supabase
      .from('nexus_class_absences')
      .select('test_unlocked_at, test_passed_at')
      .eq('id', item.id)
      .maybeSingle();

    if (!(await isTestOpen(supabase, params.classId, userId, fresh || item))) {
      return NextResponse.json(
        {
          error: 'TEST_LOCKED',
          message: 'Finish the class recap to unlock this test.',
        },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const answers = (body?.answers && typeof body.answers === 'object' ? body.answers : {}) as Record<
      string,
      string
    >;

    // The grader owns the consequences: passing clears the class. A fail no
    // longer locks anything, so there is nothing to undo here either.
    const result = await gradeTestOneShot(
      {
        testId: test.test_id,
        studentId: userId,
        answers,
        placementId: test.placement_id,
      },
      supabase,
    );

    return NextResponse.json({
      ...result,
      // Where the student goes next. A fail now offers both: another go at a
      // fresh window of questions, or the recording again. Sending them back to
      // the video was the only option when a fail re-locked the paper, and that
      // rule never actually held in production.
      next: result.passed
        ? { action: 'continue' }
        : { action: 'retry', classId: params.classId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit the test';
    console.error('Catch-up class test POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
