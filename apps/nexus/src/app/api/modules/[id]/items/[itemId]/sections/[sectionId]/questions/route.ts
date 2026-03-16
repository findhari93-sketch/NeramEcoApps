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
 * GET /api/modules/[id]/items/[itemId]/sections/[sectionId]/questions
 * List quiz questions for a section (Admin).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string; sectionId: string }> }
) {
  try {
    await verifyTeacher(request);
    const { sectionId } = await params;
    const supabase = getSupabaseAdminClient() as any;

    const { data: questions, error } = await supabase
      .from('nexus_module_item_quiz_questions')
      .select('*')
      .eq('section_id', sectionId)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ questions: questions || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load questions';
    console.error('Module questions GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/modules/[id]/items/[itemId]/sections/[sectionId]/questions
 * Create a quiz question (Admin).
 * Body: { question_text, option_a, option_b, option_c, option_d, correct_option, explanation?, sort_order? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string; sectionId: string }> }
) {
  try {
    await verifyTeacher(request);
    const { sectionId } = await params;
    const supabase = getSupabaseAdminClient() as any;
    const body = await request.json();

    if (
      !body.question_text?.trim() ||
      !body.option_a?.trim() ||
      !body.option_b?.trim() ||
      !body.option_c?.trim() ||
      !body.option_d?.trim() ||
      !body.correct_option
    ) {
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

    const { data: question, error } = await supabase
      .from('nexus_module_item_quiz_questions')
      .insert({
        section_id: sectionId,
        question_text: body.question_text.trim(),
        option_a: body.option_a.trim(),
        option_b: body.option_b.trim(),
        option_c: body.option_c.trim(),
        option_d: body.option_d.trim(),
        correct_option: body.correct_option,
        explanation: body.explanation?.trim() || null,
        sort_order: body.sort_order ?? 0,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ question }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create question';
    console.error('Module questions POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
