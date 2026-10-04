import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import type { NexusQBQuestionSource } from '@neram/database';
import { describeError } from '@/lib/api-errors';
import { nexusFeatureEnabled } from '@/lib/pad/caller';
import { isUuid } from '@/lib/pad/session-binding';
import { verifyQBStaff } from '@/lib/qb-auth';
import { listDeck, paperDeck, paperTitle, type DeckSourceQuestion } from '@/lib/qb-present/deck';

export const dynamic = 'force-dynamic';

const QUESTION_COLUMNS =
  'id, question_format, question_text, question_image_url, options, correct_answer, display_order, section, section_order, drawing_parts, is_active';
const MAX_IDS = 200;

function noStore(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

async function sourcesFor(supabase: any, ids: string[]): Promise<Record<string, NexusQBQuestionSource[]>> {
  if (!ids.length) return {};
  const { data, error } = await supabase.from('nexus_qb_question_sources').select('*').in('question_id', ids);
  if (error) throw error;
  const out: Record<string, NexusQBQuestionSource[]> = {};
  for (const row of (data || []) as NexusQBQuestionSource[]) (out[row.question_id] ||= []).push(row);
  return out;
}

/**
 * GET /api/question-bank/present  (staff)
 *
 *   ?paper=<id>          a whole paper, in paper order, labelled with its numbers
 *   ?ids=<id>,<id>,...   questions the teacher picked, in that order (up to 200)
 *   ?solution=<id>       one question's explanation and solution picture,
 *                        fetched by the presenter only after Reveal
 *
 * The deck Present to class steps through. It never carries an answer: the
 * screen it feeds is shared with the class, and the pad grades with the key
 * pad_ask reads from the bank on the server. Hidden questions are left out.
 */
export async function GET(request: NextRequest) {
  try {
    const access = await verifyQBStaff(request.headers.get('Authorization'));
    if (!access.ok) return access.response;
    if (!(await nexusFeatureEnabled('staff.qb-present'))) return noStore({ error: 'Not found' }, { status: 404 });

    const params = request.nextUrl.searchParams;
    const supabase = getSupabaseAdminClient() as any;

    const solutionId = params.get('solution');
    if (solutionId) {
      if (!isUuid(solutionId)) return noStore({ error: 'Not found' }, { status: 404 });
      const { data, error } = await supabase
        .from('nexus_qb_questions')
        .select('explanation_brief, solution_image_url')
        .eq('id', solutionId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return noStore({ error: 'Not found' }, { status: 404 });
      return noStore({ explanation: data.explanation_brief || null, imageUrl: data.solution_image_url || null });
    }

    const paperId = params.get('paper');
    if (paperId) {
      if (!isUuid(paperId)) return noStore({ error: 'Paper not found' }, { status: 404 });
      const { data: paper, error: paperError } = await supabase
        .from('nexus_qb_original_papers')
        .select('id, exam_type, year, session, shift')
        .eq('id', paperId)
        .maybeSingle();
      if (paperError) throw paperError;
      if (!paper) return noStore({ error: 'Paper not found' }, { status: 404 });

      const { data: rows, error } = await supabase
        .from('nexus_qb_questions')
        .select(QUESTION_COLUMNS)
        .eq('original_paper_id', paperId)
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (error) throw error;
      const questions = (rows || []) as DeckSourceQuestion[];
      const sources = await sourcesFor(supabase, questions.map((q) => q.id));
      const items = paperDeck(
        questions.map((q) => ({ ...q, sources: sources[q.id] ?? [] })),
        { exam: paper.exam_type, year: paper.year, session: paper.session ?? null, shift: paper.shift ?? null },
      );
      return noStore({ title: paperTitle(paper), source: { kind: 'paper', id: paper.id }, items });
    }

    const ids = (params.get('ids') ?? '')
      .split(',')
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean);
    if (!ids.length || ids.length > MAX_IDS || !ids.every(isUuid)) {
      return noStore({ error: `Choose a paper or up to ${MAX_IDS} questions.` }, { status: 400 });
    }
    const unique = Array.from(new Set(ids));
    const { data: rows, error } = await supabase
      .from('nexus_qb_questions')
      .select(QUESTION_COLUMNS)
      .in('id', unique)
      .eq('is_active', true);
    if (error) throw error;
    const questions = (rows || []) as DeckSourceQuestion[];
    const sources = await sourcesFor(supabase, questions.map((q) => q.id));
    const items = listDeck(
      questions.map((q) => ({ ...q, sources: sources[q.id] ?? [] })),
      unique,
    );
    return noStore({ title: `${items.length} question${items.length === 1 ? '' : 's'}`, source: { kind: 'list' }, items });
  } catch (err) {
    console.error('[QB present] Error:', describeError(err));
    return noStore({ error: 'Could not load the questions. Please try again.' }, { status: 500 });
  }
}
