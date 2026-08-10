import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { verifyQBAccess } from '@/lib/qb-auth';
import {
  getSupabaseAdminClient,
  getQBQuestionDetail,
  updateQBQuestion,
  softDeleteQBQuestion,
  hardDeleteQBQuestions,
  getQuestionTagIds,
  setQuestionTags,
} from '@neram/database';
import { getLinkedDrawingQuestionId } from '@neram/database/queries/nexus';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import { getQuestionOrigin } from '@/lib/test-import-store';

import { describeError } from '@/lib/api-errors';

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

    const tag_ids = await getQuestionTagIds(id);

    /**
     * `?origin=1`: which upload produced this question.
     *
     * Answered here rather than from a route of its own so the detail view
     * still costs one invocation, and asked for explicitly because the list
     * views that also read this endpoint have no use for it.
     *
     * Staff only. A student browsing the bank has no business knowing which
     * teacher uploaded which file.
     */
    let origin = null;
    if (request.nextUrl.searchParams.get('origin') === '1' && resolveStaffRole(caller) !== null) {
      origin = await getQuestionOrigin(id).catch(() => null);
    }

    return NextResponse.json({ data: { ...data, drawing_question_id, tag_ids, origin } }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Error:', describeError(err));
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

    // Tags travel separately from the question row (junction table). Replace
    // semantics is correct here: the edit form shows the full tag set.
    const tagIds: string[] | null = Array.isArray(body.tag_ids) ? body.tag_ids : null;
    delete body.tag_ids;

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
    if (tagIds) await setQuestionTags(id, tagIds, caller.id);

    return NextResponse.json({ data }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Error:', describeError(err));
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

    // Default stays a soft delete. ?hard=1 is the guarded permanent one, which
    // refuses anything a student has answered or a test is holding: five tables
    // reference this row with ON DELETE CASCADE and one of them is
    // nexus_test_questions, so an unguarded delete rewrites the score of a paper
    // that has already been sat.
    const hard = request.nextUrl.searchParams.get('hard') === '1';
    if (!hard) {
      await softDeleteQBQuestion(id);
      return NextResponse.json({ data: { success: true, mode: 'soft' } }, { status: 200 });
    }

    const force = request.nextUrl.searchParams.get('force') === '1';
    const result = await hardDeleteQBQuestions([id], { force, actorId: caller.id });

    if (result.deleted.length === 0) {
      return NextResponse.json(
        {
          error: 'This question cannot be deleted permanently.',
          preflight: result.refused[0] ?? null,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ data: { success: true, mode: 'hard' } }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
