import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  updateFoundationQuizQuestion,
  deleteFoundationQuizQuestion,
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await verifyTeacher(request);
    const body = await request.json();

    if (body.correct_option && !['a', 'b', 'c', 'd'].includes(body.correct_option)) {
      return NextResponse.json(
        { error: 'correct_option must be a, b, c, or d' },
        { status: 400 }
      );
    }

    const question = await updateFoundationQuizQuestion(params.id, body);
    return NextResponse.json({ question });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update question';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await verifyTeacher(request);
    await deleteFoundationQuizQuestion(params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete question';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
