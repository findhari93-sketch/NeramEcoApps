import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getSectionQuestionsAdmin,
  createFoundationQuizQuestion,
} from '@neram/database/queries/nexus';

async function verifyTeacher(request: NextRequest) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient();
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type')
    .eq('ms_oid', msUser.oid)
    .single();
  if (!user || (user.user_type !== 'teacher' && user.user_type !== 'admin')) {
    throw new Error('Not authorized');
  }
  return user;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await verifyTeacher(request);
    const questions = await getSectionQuestionsAdmin(params.id);
    return NextResponse.json({ questions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load questions';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await verifyTeacher(request);
    const body = await request.json();

    if (!body.question_text?.trim() || !body.option_a?.trim() || !body.option_b?.trim() ||
        !body.option_c?.trim() || !body.option_d?.trim() || !body.correct_option) {
      return NextResponse.json(
        { error: 'question_text, all 4 options, and correct_option are required' },
        { status: 400 }
      );
    }

    if (!['a', 'b', 'c', 'd'].includes(body.correct_option)) {
      return NextResponse.json(
        { error: 'correct_option must be a, b, c, or d' },
        { status: 400 }
      );
    }

    const question = await createFoundationQuizQuestion({
      section_id: params.id,
      question_text: body.question_text.trim(),
      option_a: body.option_a.trim(),
      option_b: body.option_b.trim(),
      option_c: body.option_c.trim(),
      option_d: body.option_d.trim(),
      correct_option: body.correct_option,
      explanation: body.explanation?.trim() || null,
      sort_order: body.sort_order ?? 0,
    });

    return NextResponse.json({ question }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create question';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
