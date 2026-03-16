import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import {
  submitQBAttempt,
  getQBQuestionDetail,
} from '@neram/database';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: questionId } = await params;
    const body = await request.json();
    const { selected_answer, time_spent_seconds, mode, classroom_id } = body;

    // Verify QB access (enrollment + QB enabled for students)
    const access = await verifyQBAccess(request.headers.get('Authorization'), classroom_id || null);
    if (!access.ok) return access.response;
    const caller = access.caller;

    if (selected_answer === undefined || selected_answer === null) {
      return NextResponse.json({ error: 'selected_answer is required' }, { status: 400 });
    }

    // Submit the attempt (the function checks correctness internally)
    const { attempt, isCorrect } = await submitQBAttempt(
      caller.id,
      questionId,
      selected_answer,
      time_spent_seconds || null,
      mode || 'practice',
    );

    // Get the question detail to return explanation
    const question = await getQBQuestionDetail(questionId, caller.id);
    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        attempt,
        isCorrect,
        correct_answer: question.correct_answer,
        explanation_brief: question.explanation_brief,
      },
    }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
