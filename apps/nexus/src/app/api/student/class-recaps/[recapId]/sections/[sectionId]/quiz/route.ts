import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  getRecapSection,
  getRecapSectionQuestionsForStudent,
  getRecapSectionQuestionsWithAnswers,
  listRecapSectionOrder,
  getPassedSectionIds,
  countRecapAttempts,
  insertRecapAttempt,
  upsertRecapProgress,
  markRecapCompletedIfAllPassed,
  unlockCatchupTestForRecap,
  getRecapDraw,
  createRecapDraw,
  consumeRecapDraw,
} from '@neram/database';
import {
  pickDraw,
  buildOptionMaps,
  applyOptionMap,
  displayedToOriginal,
  originalToDisplayed,
  drawSeed,
  type OptionLetter,
} from '@/lib/recap-draw';

async function resolveStudent(request: NextRequest) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient() as any;
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('ms_oid', msUser.oid)
    .single();
  return user as { id: string } | null;
}

/**
 * Guard: a checkpoint is playable only when every earlier checkpoint is passed.
 * Returns the recapId the section belongs to, or throws a friendly error.
 */
async function assertUnlocked(sectionId: string, studentId: string): Promise<string> {
  const section = await getRecapSection(sectionId);
  if (!section) throw new Error('SECTION_NOT_FOUND');
  const order = await listRecapSectionOrder(section.recap_id);
  const idx = order.findIndex((s) => s.id === sectionId);
  const prior = order.slice(0, idx).map((s) => s.id);
  if (prior.length) {
    const passed = await getPassedSectionIds(studentId, section.recap_id);
    const allPriorPassed = prior.every((id) => passed.has(id));
    if (!allPriorPassed) throw new Error('LOCKED');
  }
  return section.recap_id;
}

/**
 * Resolve (or create) the paper for the student's current attempt.
 *
 * Shared by GET and POST so the two can never disagree about what was asked.
 * Serving every question in sort_order, as this route used to, meant a failed
 * attempt could be beaten by remembering positions rather than by rewatching.
 */
async function resolveDraw(studentId: string, sectionId: string, questionIds: string[]) {
  const section = await getRecapSection(sectionId);
  const attemptNumber = (await countRecapAttempts(studentId, sectionId)) + 1;

  const existing = await getRecapDraw(studentId, sectionId, attemptNumber);
  if (existing) return { draw: existing, attemptNumber, section };

  const seed = drawSeed(studentId, sectionId);
  const serve = section?.questions_to_serve ?? questionIds.length;
  const chosen = pickDraw(questionIds, serve, attemptNumber, seed);
  const draw = await createRecapDraw({
    student_id: studentId,
    section_id: sectionId,
    attempt_number: attemptNumber,
    question_ids: chosen,
    option_maps: buildOptionMaps(chosen, attemptNumber, seed),
  });
  return { draw, attemptNumber, section };
}

/**
 * GET .../sections/[sectionId]/quiz
 * Checkpoint questions (answers stripped). Locked until prior checkpoints pass.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ recapId: string; sectionId: string }> },
) {
  try {
    const { sectionId } = await params;
    const user = await resolveStudent(request);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    await assertUnlocked(sectionId, user.id);
    const pool = await getRecapSectionQuestionsForStudent(sectionId);
    if (!pool.length) return NextResponse.json({ questions: [] });

    const { draw } = await resolveDraw(
      user.id,
      sectionId,
      pool.map((q) => q.id),
    );

    const byId = new Map(pool.map((q) => [q.id, q]));
    const questions = draw.question_ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((q) =>
        applyOptionMap(q as any, draw.option_maps?.[(q as any).id] as OptionLetter[] | undefined),
      );

    return NextResponse.json({ questions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load quiz';
    if (message === 'LOCKED') {
      return NextResponse.json(
        { error: 'Finish the earlier checkpoints first.' },
        { status: 403 },
      );
    }
    if (message === 'SECTION_NOT_FOUND') {
      return NextResponse.json({ error: 'Checkpoint not found' }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST .../sections/[sectionId]/quiz
 * Body: { answers: { [questionId]: 'a'|'b'|'c'|'d' } }
 * Grades the checkpoint, records the attempt, and (if all checkpoints now pass)
 * marks the whole recap completed. Sequential unlock is enforced.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  try {
    const { sectionId } = await params;
    const user = await resolveStudent(request);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    if (!body.answers || typeof body.answers !== 'object') {
      return NextResponse.json({ error: 'Missing answers object' }, { status: 400 });
    }

    const recapId = await assertUnlocked(sectionId, user.id);

    const all = await getRecapSectionQuestionsWithAnswers(sectionId);
    if (!all.length) {
      return NextResponse.json({ error: 'No questions for this checkpoint' }, { status: 404 });
    }

    const { draw, attemptNumber, section } = await resolveDraw(
      user.id,
      sectionId,
      all.map((q) => q.id),
    );

    // Grade ONLY the questions this attempt actually served. Grading the whole
    // pool would mark a student wrong on questions they were never shown.
    const byId = new Map(all.map((q) => [q.id, q]));
    const served = draw.question_ids.map((id) => byId.get(id)).filter(Boolean) as typeof all;

    let correctCount = 0;
    const totalCount = served.length;
    const questionsWithExplanations = served.map((q) => {
      const map = draw.option_maps?.[q.id] as OptionLetter[] | undefined;
      // The student clicked a DISPLAYED letter. Translate it back through this
      // attempt's permutation before comparing, or every answer grades wrong.
      const displayedAnswer = body.answers[q.id] || null;
      const originalAnswer = displayedToOriginal(displayedAnswer, map);
      const isCorrect = !!originalAnswer && originalAnswer === q.correct_option;
      if (isCorrect) correctCount++;

      const shown = applyOptionMap(q as any, map);
      return {
        id: q.id,
        question_text: q.question_text,
        option_a: shown.option_a,
        option_b: shown.option_b,
        option_c: shown.option_c,
        option_d: shown.option_d,
        // Reported in the SAME lettering the student saw, so the review screen
        // highlights the option they are looking at.
        correct_option: originalToDisplayed(q.correct_option, map) ?? q.correct_option,
        explanation: q.explanation,
        student_answer: displayedAnswer,
        is_correct: isCorrect,
      };
    });

    const minToPass = Math.min(section?.min_questions_to_pass ?? totalCount, totalCount);
    const scorePct = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
    const passed = correctCount >= minToPass;

    const attempt = await insertRecapAttempt({
      student_id: user.id,
      section_id: sectionId,
      score_pct: scorePct,
      answers: body.answers,
      passed,
      attempt_number: attemptNumber,
    });

    // Spent, whatever the outcome. The next attempt draws a fresh window, which
    // is what stops a failed attempt being beaten by memory rather than rewatching.
    await consumeRecapDraw(draw.id).catch(() => {});

    let recapCompleted = false;
    let catchupTestUnlocked = false;
    if (passed) {
      await upsertRecapProgress(user.id, recapId, { last_section_id: sectionId });
      recapCompleted = await markRecapCompletedIfAllPassed(user.id, recapId);

      // Finishing the recap is what opens the class test on a catch-up backlog
      // item. Best-effort: a student who has just passed their last checkpoint
      // should not see an error because a table they have never heard of was
      // unavailable, and the re-arm route can open it later regardless.
      if (recapCompleted) {
        try {
          catchupTestUnlocked = await unlockCatchupTestForRecap(user.id, recapId);
        } catch (unlockErr) {
          console.error(
            '[recap] catch-up test unlock failed (non-fatal):',
            unlockErr instanceof Error ? unlockErr.message : unlockErr,
          );
        }
      }
    }

    return NextResponse.json({
      attempt: {
        id: attempt.id,
        passed,
        score_pct: scorePct,
        correct_count: correctCount,
        total_count: totalCount,
        min_to_pass: minToPass,
        questions_with_explanations: questionsWithExplanations,
      },
      recap_completed: recapCompleted,
      catchup_test_unlocked: catchupTestUnlocked,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit quiz';
    if (message === 'LOCKED') {
      return NextResponse.json({ error: 'Finish the earlier checkpoints first.' }, { status: 403 });
    }
    if (message === 'SECTION_NOT_FOUND') {
      return NextResponse.json({ error: 'Checkpoint not found' }, { status: 404 });
    }
    console.error('Class recap quiz POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
