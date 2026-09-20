import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  getRecapSection,
  countRecapAttempts,
  getRecapDraw,
  dropQuestionFromDraw,
  reportRecapQuestion,
  type RecapQuestionReportType,
} from '@neram/database';

/**
 * POST .../sections/[sectionId]/questions/[questionId]/report
 * Body: { reportType, description? }
 *
 * A student saying a checkpoint question is broken, and getting past it.
 *
 * Both halves matter. The quiz modal cannot be closed (RecapWatch passes
 * dismissable={false}), which is correct while the questions are sound and a
 * trap the moment one is not: a wrong answer key is a gate that can never be
 * passed and never left, and the student's only other buttons are Retry and
 * Rewatch and Retry. Before this route existed there was nowhere in the whole
 * student recap player to say so.
 *
 * Dropping the question from the current draw is the entire unblocking
 * mechanism. The grading path scores only `draw.question_ids` and clamps the
 * pass mark with `Math.min(gate.minToPass, totalCount)`, so one fewer question
 * served is one fewer needed to pass.
 *
 * The unique index on (question_id, student_id) is what stops this being a way
 * THROUGH the gate rather than a way to fix it: a second report of the same
 * question returns the first one, and drops nothing further.
 */
const TYPES: RecapQuestionReportType[] = [
  'wrong_answer',
  'no_correct_option',
  'unclear_question',
  'not_taught',
  'other',
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ recapId: string; sectionId: string; questionId: string }> },
) {
  try {
    const { sectionId, questionId } = await params;

    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const reportType = TYPES.includes(body.reportType) ? body.reportType : null;
    if (!reportType) {
      return NextResponse.json({ error: 'Pick what is wrong with the question' }, { status: 400 });
    }

    const section = await getRecapSection(sectionId);
    if (!section) return NextResponse.json({ error: 'Checkpoint not found' }, { status: 404 });

    const { created, report } = await reportRecapQuestion({
      questionId,
      studentId: user.id,
      reportType,
      description: typeof body.description === 'string' ? body.description : null,
    });
    if (!report) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    // The attempt they are sitting right now. countRecapAttempts is the number
    // ALREADY graded, so the live one is that plus one, exactly as resolveDraw
    // works it out on the quiz route.
    let remaining: number | null = null;
    try {
      const attemptNumber = (await countRecapAttempts(user.id, sectionId)) + 1;
      const draw = await getRecapDraw(user.id, sectionId, attemptNumber);
      if (draw) {
        const out = await dropQuestionFromDraw(draw.id, questionId);
        remaining = out.remaining;
      }
    } catch (err) {
      // The report is filed and that is the part that must not be lost. A draw
      // that could not be edited leaves the student where they were, which is
      // no worse than before, and the teacher has still been told.
      console.error(
        '[recap] reported question could not be dropped from the draw:',
        err instanceof Error ? err.message : err,
      );
    }

    return NextResponse.json({
      ok: true,
      created,
      report_id: report.id,
      questions_remaining: remaining,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not report this question';
    console.error('Recap question report error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
