import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import {
  getSupabaseAdminClient,
  getOriginalPaperWithStats,
  getPaperSectionBreakdown,
  getQuestionsByPaper,
  deletePaperWithQuestions,
} from '@neram/database';
import { buildPaperBlueprint } from '@/lib/paper-blueprint';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;
    const supabase = getSupabaseAdminClient();

    const paper = await getOriginalPaperWithStats(params.id);
    if (!paper) {
      return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
    }

    // ?structure=1 is the test wizard's PYQ step asking what the paper is
    // shaped like. It deliberately does NOT return the questions: the year grid
    // shows a section summary for a paper the teacher has not chosen yet, and
    // shipping 82 full question rows to draw three lines is most of the reason
    // that grid would feel slow.
    if (new URL(request.url).searchParams.get('structure') === '1') {
      const breakdown = await getPaperSectionBreakdown(params.id);
      const blueprint = buildPaperBlueprint(breakdown, (paper as any).exam_type);
      return NextResponse.json({ data: { paper, blueprint } }, { status: 200 });
    }

    const questions = await getQuestionsByPaper(params.id);

    return NextResponse.json({
      data: { paper, questions },
    }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Paper Detail API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;
    const supabase = getSupabaseAdminClient();

    const body = await request.json();
    const allowedFields = ['pdf_url', 'total_marks', 'duration_minutes'];
    const updates: Record<string, any> = {};
    for (const key of allowedFields) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('nexus_qb_original_papers')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Paper Detail API] PATCH Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;
    const supabase = getSupabaseAdminClient();

    const result = await deletePaperWithQuestions(params.id);

    return NextResponse.json({
      data: result,
      message: `Paper deleted with ${result.deletedQuestions} questions`,
    }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Paper Detail API] DELETE Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
