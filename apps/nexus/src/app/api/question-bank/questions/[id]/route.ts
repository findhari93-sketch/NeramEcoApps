import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { verifyQBAccess } from '@/lib/qb-auth';
import {
  getSupabaseAdminClient,
  getQBQuestionDetail,
  updateQBQuestion,
  softDeleteQBQuestion,
} from '@neram/database';
import { getLinkedDrawingQuestionId } from '@neram/database/queries/nexus';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const classroomId = request.nextUrl.searchParams.get('classroom_id') || null;

    // Verify QB access (enrollment + QB enabled for students)
    const access = await verifyQBAccess(request.headers.get('Authorization'), classroomId);
    if (!access.ok) return access.response;
    const caller = access.caller;

    const { id } = await params;
    const data = await getQBQuestionDetail(id, caller.id);

    if (!data) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    // For DRAWING_PROMPT questions, include the linked drawing_question_id
    let drawing_question_id: string | null = null;
    if (data.question_format === 'DRAWING_PROMPT') {
      drawing_question_id = await getLinkedDrawingQuestionId(id);
    }

    return NextResponse.json({ data: { ...data, drawing_question_id } }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
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

    if (!['teacher', 'admin'].includes(caller.user_type ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    // When activating (is_active=true), also promote status to 'active'
    // if the question has an answer key (answer_keyed or complete)
    if (body.is_active === true) {
      const { data: existing } = await supabase
        .from('nexus_qb_questions')
        .select('*')
        .eq('id', id)
        .single();

      if (existing && ['answer_keyed', 'complete'].includes((existing as any).status)) {
        body.status = 'active';
      }
    }

    const data = await updateQBQuestion(id, body);

    return NextResponse.json({ data }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
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

    if (!['teacher', 'admin'].includes(caller.user_type ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    await softDeleteQBQuestion(id);

    return NextResponse.json({ data: { success: true } }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
