import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  submitQBAttempt,
  getQBQuestionDetail,
} from '@neram/database/src/queries/nexus/question-bank';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const msUser = await verifyMsToken(authHeader);
    const supabase = getSupabaseAdminClient();

    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { id: questionId } = await params;
    const body = await request.json();
    const { selected_answer, time_spent_seconds, mode } = body;

    if (selected_answer === undefined || selected_answer === null) {
      return NextResponse.json({ error: 'selected_answer is required' }, { status: 400 });
    }

    // Get the question to check correct answer
    const question = await getQBQuestionDetail(supabase, questionId, caller.id);
    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    const isCorrect = selected_answer === question.correct_answer;

    const attempt = await submitQBAttempt(supabase, {
      question_id: questionId,
      student_id: caller.id,
      selected_answer,
      is_correct: isCorrect,
      time_spent_seconds: time_spent_seconds || null,
      mode: mode || 'practice',
    });

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
