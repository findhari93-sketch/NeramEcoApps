import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

async function verifyTeacher(request: NextRequest) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient() as any;
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

/**
 * PATCH /api/modules/[id]/items/[itemId]/questions/[questionId]
 * Update a quiz question (Admin).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string; questionId: string }> }
) {
  try {
    await verifyTeacher(request);
    const { questionId } = await params;
    const supabase = getSupabaseAdminClient() as any;
    const body = await request.json();

    if (body.correct_option && !['a', 'b', 'c', 'd'].includes(body.correct_option)) {
      return NextResponse.json(
        { error: 'correct_option must be a, b, c, or d' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (body.question_text !== undefined) updateData.question_text = body.question_text;
    if (body.option_a !== undefined) updateData.option_a = body.option_a;
    if (body.option_b !== undefined) updateData.option_b = body.option_b;
    if (body.option_c !== undefined) updateData.option_c = body.option_c;
    if (body.option_d !== undefined) updateData.option_d = body.option_d;
    if (body.correct_option !== undefined) updateData.correct_option = body.correct_option;
    if (body.explanation !== undefined) updateData.explanation = body.explanation;
    if (body.sort_order !== undefined) updateData.sort_order = body.sort_order;

    const { data: question, error } = await supabase
      .from('nexus_module_item_quiz_questions')
      .update(updateData)
      .eq('id', questionId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ question });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update question';
    console.error('Module question PATCH error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/modules/[id]/items/[itemId]/questions/[questionId]
 * Delete a quiz question (Admin).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string; questionId: string }> }
) {
  try {
    await verifyTeacher(request);
    const { questionId } = await params;
    const supabase = getSupabaseAdminClient() as any;

    const { error } = await supabase
      .from('nexus_module_item_quiz_questions')
      .delete()
      .eq('id', questionId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete question';
    console.error('Module question DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
