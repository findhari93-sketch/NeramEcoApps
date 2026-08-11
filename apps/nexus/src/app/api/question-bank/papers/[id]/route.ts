import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import {
  getSupabaseAdminClient,
  getOriginalPaperWithStats,
  getPaperSectionBreakdown,
  getQuestionsByPaper,
  deletePaperWithQuestions,
  getQuestionTagIdsBatch,
} from '@neram/database';
import type { NexusQBOriginalPaper, NexusQBQuestionSource } from '@neram/database';
import { buildPaperBlueprint } from '@/lib/paper-blueprint';


import { describeError } from '@/lib/api-errors';
type PaperTuple = Pick<NexusQBOriginalPaper, 'exam_type' | 'year' | 'session' | 'shift'>;

/**
 * The tuple that joins a paper to its question source rows.
 *
 * Both unique indexes key on (exam_type, year, COALESCE(session,''),
 * COALESCE(shift,'')), so a null session and an empty-string session are the
 * same paper. This mirrors paperKey() in packages/database; keep them in step.
 */
function paperTupleKey(t: PaperTuple): string {
  return `${t.exam_type}|${t.year}|${t.session ?? ''}|${t.shift ?? ''}`;
}

/**
 * Source rows for this paper's questions, keyed by question id.
 *
 * The editor's Source & Format panel reads the exam/year/session tuple from
 * here. It used to be handed nothing and fell back to a literal 'NATA' plus the
 * current year, so a 2006 JEE paper's questions all read as NATA 2026.
 *
 * The row belonging to THIS paper is sorted first, because the editor reads
 * sources[0] and a question that also appeared in a later paper has more than
 * one row. Picking arbitrarily would label a 2006 question with its 2019
 * reappearance.
 */
async function getSourcesByQuestion(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  paper: PaperTuple,
  questionIds: string[]
): Promise<Record<string, NexusQBQuestionSource[]>> {
  if (questionIds.length === 0) return {};

  const { data, error } = await supabase
    .from('nexus_qb_question_sources')
    .select('*')
    .in('question_id', questionIds);
  if (error) throw error;

  const wanted = paperTupleKey(paper);
  const byQuestion: Record<string, NexusQBQuestionSource[]> = {};
  for (const row of (data || []) as unknown as NexusQBQuestionSource[]) {
    (byQuestion[row.question_id] ||= []).push(row);
  }
  for (const rows of Object.values(byQuestion)) {
    rows.sort(
      (a, b) => Number(paperTupleKey(b) === wanted) - Number(paperTupleKey(a) === wanted)
    );
  }
  return byQuestion;
}

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
    const questionIds = questions.map((q) => q.id);
    const [sources, tagsByQuestion] = await Promise.all([
      getSourcesByQuestion(supabase, paper as unknown as PaperTuple, questionIds),
      getQuestionTagIdsBatch(questionIds, supabase),
    ]);

    return NextResponse.json({
      data: { paper, questions, sources, tagsByQuestion },
    }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Paper Detail API] Error:', describeError(err));
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
    console.error('[Paper Detail API] PATCH Error:', describeError(err));
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
    console.error('[Paper Detail API] DELETE Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
