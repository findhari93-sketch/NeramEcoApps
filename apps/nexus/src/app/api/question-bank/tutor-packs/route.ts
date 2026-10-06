/**
 * GET /api/question-bank/tutor-packs?status=draft|verified|reviewed|retired&page=1&page_size=20
 *
 * The AI Tutor's packs, for staff to review: each row with the question it
 * teaches (text, format, the paper it came from), its verify report, and the
 * pack itself for a preview. Staff only. Packs carry the worked answer, so
 * this never answers a student.
 *
 * nexus_qb_tutor_packs is not in the generated types yet, hence the untyped client.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, QB_EXAM_TYPE_LABELS, type QBExamType } from '@neram/database';
import { describeError } from '@/lib/api-errors';
import { verifyQBStaff } from '@/lib/qb-auth';

const STATUSES = ['draft', 'verified', 'reviewed', 'retired'] as const;
type PackStatus = (typeof STATUSES)[number];
const MAX_PAGE_SIZE = 50;

export interface TutorPackRow {
  id: string;
  question_id: string;
  version: number;
  status: PackStatus;
  generator: string;
  model: string | null;
  reviewed_at: string | null;
  updated_at: string;
  verify_report: { ok?: boolean; errors?: string[]; warnings?: string[] };
  pack: unknown;
  question: { text: string | null; format: string | null; paper: string | null } | null;
}

function paperLabel(src: { exam_type: string; year: number; session: string | null; question_number: number | null } | undefined): string | null {
  if (!src) return null;
  const exam = QB_EXAM_TYPE_LABELS[src.exam_type as QBExamType] ?? src.exam_type;
  return [exam, src.year, src.session, src.question_number ? `Q${src.question_number}` : null].filter(Boolean).join(' ');
}

export async function GET(request: NextRequest) {
  // Auth settles on its own: a bad token is a 401 or 403, never a 500.
  try {
    const access = await verifyQBStaff(request.headers.get('Authorization'));
    if (!access.ok) return access.response;
  } catch (err) {
    console.error('[QB tutor packs] auth:', describeError(err));
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const statusParam = params.get('status') || 'verified';
  if (!(STATUSES as readonly string[]).includes(statusParam)) {
    return NextResponse.json({ error: 'status must be draft, verified, reviewed or retired' }, { status: 400 });
  }
  const status = statusParam as PackStatus;
  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(params.get('page_size') || '20', 10) || 20));
  const from = (page - 1) * pageSize;

  try {
    const supabase = getSupabaseAdminClient() as any;
    const { data: packs, error, count } = await supabase
      .from('nexus_qb_tutor_packs')
      .select('id, question_id, version, status, generator, model, reviewed_at, updated_at, verify_report, pack', { count: 'exact' })
      .eq('status', status)
      .order('updated_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;

    const rows = (packs || []) as Omit<TutorPackRow, 'question'>[];
    const ids = Array.from(new Set(rows.map((r) => r.question_id)));
    const questions = new Map<string, { question_text: string | null; question_format: string | null }>();
    const sources = new Map<string, { exam_type: string; year: number; session: string | null; question_number: number | null }>();
    if (ids.length) {
      const [qRes, sRes] = await Promise.all([
        supabase.from('nexus_qb_questions').select('id, question_text, question_format').in('id', ids),
        supabase
          .from('nexus_qb_question_sources')
          .select('question_id, exam_type, year, session, question_number')
          .in('question_id', ids)
          .order('year', { ascending: false }),
      ]);
      if (qRes.error) throw qRes.error;
      if (sRes.error) throw sRes.error;
      for (const q of qRes.data || []) questions.set(q.id, q);
      // The most recent paper a question appeared in names it.
      for (const s of sRes.data || []) if (!sources.has(s.question_id)) sources.set(s.question_id, s);
    }

    const data: TutorPackRow[] = rows.map((r) => {
      const q = questions.get(r.question_id);
      return {
        ...r,
        verify_report: r.verify_report || {},
        question: q ? { text: q.question_text, format: q.question_format, paper: paperLabel(sources.get(r.question_id)) } : null,
      };
    });

    return NextResponse.json({ data, total: count ?? data.length, page, page_size: pageSize });
  } catch (err) {
    console.error('[QB tutor packs] GET:', describeError(err));
    return NextResponse.json({ error: 'The tutor packs did not load. Try again.' }, { status: 500 });
  }
}
