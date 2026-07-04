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
} from '@neram/database';

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
    const questions = await getRecapSectionQuestionsForStudent(sectionId);
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

    const section = await getRecapSection(sectionId);
    const questions = await getRecapSectionQuestionsWithAnswers(sectionId);
    if (!questions.length) {
      return NextResponse.json({ error: 'No questions for this checkpoint' }, { status: 404 });
    }

    let correctCount = 0;
    const totalCount = questions.length;
    const questionsWithExplanations = questions.map((q) => {
      const studentAnswer = body.answers[q.id] || null;
      const isCorrect = studentAnswer === q.correct_option;
      if (isCorrect) correctCount++;
      return {
        id: q.id,
        question_text: q.question_text,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_option: q.correct_option,
        explanation: q.explanation,
        student_answer: studentAnswer,
        is_correct: isCorrect,
      };
    });

    const minToPass = section?.min_questions_to_pass ?? totalCount; // null = all correct
    const scorePct = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
    const passed = correctCount >= minToPass;

    const attemptNumber = (await countRecapAttempts(user.id, sectionId)) + 1;
    const attempt = await insertRecapAttempt({
      student_id: user.id,
      section_id: sectionId,
      score_pct: scorePct,
      answers: body.answers,
      passed,
      attempt_number: attemptNumber,
    });

    let recapCompleted = false;
    if (passed) {
      await upsertRecapProgress(user.id, recapId, { last_section_id: sectionId });
      recapCompleted = await markRecapCompletedIfAllPassed(user.id, recapId);
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
