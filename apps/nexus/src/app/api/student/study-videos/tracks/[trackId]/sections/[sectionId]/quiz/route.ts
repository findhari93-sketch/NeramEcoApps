import { NextRequest, NextResponse } from 'next/server';
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
  getRecapDraw,
  createRecapDraw,
  consumeRecapDraw,
  markStudyVideoCompleted,
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
import {
  resolveSectionGate,
  gateIsIncomplete,
  readGateSettings,
  FALLBACK_GATE_SETTINGS,
  type ResolvedGate,
} from '@/lib/recap-gate';
import { getRequestUser } from '@/lib/study-materials';
import { assertCanSeeTrack, assertServable, trackErrorResponse } from '@/lib/study-video-access';

/**
 * Checkpoint quizzes on a Foundation chapter track.
 *
 * Deliberately its own route rather than a branch inside the recap quiz route,
 * for two reasons that pull in the same direction. The audience rule is
 * different (study-folder targeting, not classroom enrollment), and clearing the
 * LAST checkpoint here has a side effect a recap does not have: it satisfies the
 * video half of the chapter, which may complete the chapter outright.
 *
 * Everything in between is the recap machinery unchanged: sequential unlock
 * enforced on GET and POST, a per-attempt question draw with permuted options so
 * a screenshot cannot clear a checkpoint forever, and grading limited to the
 * questions actually served.
 */

async function gateFor(
  section: { recap_id?: string; questions_to_serve?: number | null; min_questions_to_pass?: number | null } | null,
  available: number,
): Promise<ResolvedGate> {
  if (!gateIsIncomplete(section)) {
    return resolveSectionGate(section, available, FALLBACK_GATE_SETTINGS);
  }
  const supabase = getSupabaseAdminClient() as any;
  const settings = await readGateSettings(supabase, section?.recap_id);
  return resolveSectionGate(section, available, settings);
}

/**
 * A checkpoint is playable only when every earlier one is passed, and only when
 * it belongs to the track named in the URL. The second half matters: without it
 * a student could quiz a checkpoint from another chapter's track by pairing its
 * section id with a track they are allowed to see.
 */
async function assertUnlocked(trackId: string, sectionId: string, studentId: string) {
  const section = await getRecapSection(sectionId);
  if (!section || section.recap_id !== trackId) throw new Error('SECTION_NOT_FOUND');

  const order = await listRecapSectionOrder(trackId);
  const idx = order.findIndex((s) => s.id === sectionId);
  const prior = order.slice(0, idx).map((s) => s.id);
  if (prior.length) {
    const passed = await getPassedSectionIds(studentId, trackId);
    if (!prior.every((id) => passed.has(id))) throw new Error('LOCKED');
  }
  return section;
}

async function resolveDraw(studentId: string, sectionId: string, questionIds: string[]) {
  const section = await getRecapSection(sectionId);
  const attemptNumber = (await countRecapAttempts(studentId, sectionId)) + 1;

  const existing = await getRecapDraw(studentId, sectionId, attemptNumber);
  if (existing) return { draw: existing, attemptNumber, section };

  const seed = drawSeed(studentId, sectionId);
  const { serve } = await gateFor(section as any, questionIds.length);
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

function errorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : 'Failed to load quiz';
  if (message === 'LOCKED') {
    return NextResponse.json({ error: 'Finish the earlier checkpoints first.' }, { status: 403 });
  }
  if (message === 'SECTION_NOT_FOUND') {
    return NextResponse.json({ error: 'Checkpoint not found' }, { status: 404 });
  }
  const { error, status } = trackErrorResponse(err);
  return NextResponse.json({ error }, { status });
}

/** GET: the checkpoint's questions, answers stripped. */
export async function GET(
  request: NextRequest,
  { params }: { params: { trackId: string; sectionId: string } },
) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    const track = await assertCanSeeTrack(user, params.trackId);
    assertServable(track);
    await assertUnlocked(params.trackId, params.sectionId, user.id);

    const pool = await getRecapSectionQuestionsForStudent(params.sectionId);
    if (!pool.length) return NextResponse.json({ questions: [] });

    const { draw } = await resolveDraw(user.id, params.sectionId, pool.map((q) => q.id));
    const byId = new Map(pool.map((q) => [q.id, q]));
    const questions = draw.question_ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((q) => applyOptionMap(q as any, draw.option_maps?.[(q as any).id] as OptionLetter[] | undefined));

    return NextResponse.json({ questions });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * POST: grade the checkpoint. Body { answers: { [questionId]: 'a'|'b'|'c'|'d' } }.
 *
 * Passing the last checkpoint marks the video half of the chapter done, and
 * reports whether that completed the chapter, so the student is told which of
 * the two things just happened rather than being left to guess.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { trackId: string; sectionId: string } },
) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    const track = await assertCanSeeTrack(user, params.trackId);
    assertServable(track);

    const body = await request.json().catch(() => ({}));
    if (!body.answers || typeof body.answers !== 'object') {
      return NextResponse.json({ error: 'Missing answers object' }, { status: 400 });
    }

    await assertUnlocked(params.trackId, params.sectionId, user.id);

    const all = await getRecapSectionQuestionsWithAnswers(params.sectionId);
    if (!all.length) {
      return NextResponse.json({ error: 'No questions for this checkpoint' }, { status: 404 });
    }

    const { draw, attemptNumber, section } = await resolveDraw(
      user.id,
      params.sectionId,
      all.map((q) => q.id),
    );

    // Grade ONLY what this attempt served. Grading the whole pool would mark a
    // student wrong on questions they were never shown.
    const byId = new Map(all.map((q) => [q.id, q]));
    const served = draw.question_ids.map((id) => byId.get(id)).filter(Boolean) as typeof all;

    let correctCount = 0;
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
        correct_option: originalToDisplayed(q.correct_option, map) ?? q.correct_option,
        explanation: q.explanation,
        student_answer: displayedAnswer,
        is_correct: isCorrect,
      };
    });

    const totalCount = served.length;
    // Clamped to what was actually served, so a question deleted since the draw
    // was minted cannot push the pass mark above the paper in front of them.
    const gate = await gateFor(section as any, all.length);
    const minToPass = Math.min(gate.minToPass, totalCount);
    const scorePct = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
    const passed = correctCount >= minToPass;

    const attempt = await insertRecapAttempt({
      student_id: user.id,
      section_id: params.sectionId,
      score_pct: scorePct,
      answers: body.answers,
      passed,
      attempt_number: attemptNumber,
    });

    // Spent whatever the outcome, so a failed attempt is beaten by rewatching
    // rather than by remembering which options were where.
    await consumeRecapDraw(draw.id).catch(() => {});

    let videoCompleted = false;
    let chapterCompleted = false;
    if (passed) {
      await upsertRecapProgress(user.id, params.trackId, { last_section_id: params.sectionId });
      // Rechecks that every checkpoint passes before it credits anything, so a
      // caller cannot talk it into completing a half-watched track.
      const result = await markStudyVideoCompleted(user.id, params.trackId);
      videoCompleted = result.video_completed;
      chapterCompleted = result.chapter_completed;
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
      video_completed: videoCompleted,
      chapter_completed: chapterCompleted,
      // The remaining step when the video is done but the paper is not.
      test_unlocked: videoCompleted && !chapterCompleted,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
