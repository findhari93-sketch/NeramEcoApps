import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import { suggestSection } from '@/lib/qb-collision-suggestion';
import { assignSectionOrders } from '@/lib/qb-collision-renumber';
import {
  findSectionOrderCollisions,
  resolveSectionOrderCollisions,
  getSupabaseAdminClient,
  isQBQuestionSection,
  type QBQuestionSection,
} from '@neram/database';
import { describeError } from '@/lib/api-errors';

/**
 * Papers with a question-number collision: two or more questions sharing the
 * same (section, display_order), almost always because some of them were
 * mistagged with the wrong section during parsing.
 *
 * Staff only, both verbs. Nothing here is destructive: PATCH only ever moves
 * a question to a different section/number, never deletes one.
 */

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;

    const groups = await findSectionOrderCollisions();
    if (groups.length === 0) {
      return NextResponse.json({ data: { papers: [] } }, { status: 200 });
    }

    const paperIds = [...new Set(groups.map((g) => g.original_paper_id))];
    const supabase = getSupabaseAdminClient() as any;
    const { data: paperRows, error } = await supabase
      .from('nexus_qb_original_papers')
      .select('id, exam_type, year, session')
      .in('id', paperIds);
    if (error) throw error;

    const paperById = new Map((paperRows || []).map((p: any) => [p.id, p]));

    const byPaper = new Map<string, typeof groups>();
    for (const g of groups) {
      if (!byPaper.has(g.original_paper_id)) byPaper.set(g.original_paper_id, []);
      byPaper.get(g.original_paper_id)!.push(g);
    }

    const papers = Array.from(byPaper.entries()).map(([paperId, paperGroups]) => {
      const paper = paperById.get(paperId) as any;
      return {
        paper_id: paperId,
        exam_type: paper?.exam_type ?? 'unknown',
        year: paper?.year ?? null,
        session: paper?.session ?? null,
        collisions: paperGroups.map((g) => ({
          section: g.section,
          display_order: g.display_order,
          candidates: g.candidates.map((c) => ({
            id: c.id,
            question_text: c.question_text,
            question_format: c.question_format,
            current_section: c.section,
            suggested_section: suggestSection({
              question_format: c.question_format,
              question_text: c.question_text,
              categories: c.categories,
            }),
          })),
        })),
      };
    });

    return NextResponse.json({ data: { papers } }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Section Collisions API] GET Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => null);
    const paperId = typeof body?.paper_id === 'string' ? body.paper_id : null;
    const raw = Array.isArray(body?.resolutions) ? body.resolutions : null;
    if (!paperId || !raw || raw.length === 0) {
      return NextResponse.json({ error: 'paper_id and resolutions are required' }, { status: 400 });
    }

    const resolutions: Array<{ question_id: string; section: QBQuestionSection }> = [];
    for (const r of raw) {
      if (!r || typeof r.question_id !== 'string' || !r.question_id) {
        return NextResponse.json({ error: 'Every resolution needs a question_id' }, { status: 400 });
      }
      if (!isQBQuestionSection(r.section)) {
        return NextResponse.json(
          { error: `"${String(r.section)}" is not a section on this paper` },
          { status: 400 },
        );
      }
      resolutions.push({ question_id: r.question_id, section: r.section });
    }

    const supabase = getSupabaseAdminClient() as any;
    const resolvedIds = new Set(resolutions.map((r) => r.question_id));
    const { data: existing, error: existingError } = await supabase
      .from('nexus_qb_questions')
      .select('id, section, display_order')
      .eq('original_paper_id', paperId);
    if (existingError) throw existingError;

    const maxBySection: Partial<Record<QBQuestionSection, number>> = {};
    for (const row of existing || []) {
      if (resolvedIds.has(row.id) || row.display_order == null || !row.section) continue;
      const current = maxBySection[row.section as QBQuestionSection] ?? 0;
      if (row.display_order > current) maxBySection[row.section as QBQuestionSection] = row.display_order;
    }

    const fullResolutions = assignSectionOrders(maxBySection, resolutions);
    const result = await resolveSectionOrderCollisions(paperId, fullResolutions);

    return NextResponse.json({ data: result }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Section Collisions API] PATCH Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
