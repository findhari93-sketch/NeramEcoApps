import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { getQBSubjectTagTree, parseSessionKey } from '@neram/database';
import type { QBExamType } from '@neram/database';
import { describeError } from '@/lib/api-errors';

/**
 * Facet counts for the Category filter, plus the subject tag hierarchy.
 *
 * `data` is the flat slug -> count map (unchanged shape, so older callers keep
 * working). `tree` is the same numbers nested by nexus_qb_tags.parent_id, with
 * a rollup count per parent, so the drawer can render Coordinate Geometry above
 * its eight children. Both come from one RPC call.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const classroomId = params.get('classroom_id') || null;

    const access = await verifyQBAccess(request.headers.get('Authorization'), classroomId);
    if (!access.ok) return access.response;

    const examType = params.get('exam_type') as QBExamType | null;
    const year = params.get('year') ? parseInt(params.get('year')!, 10) : null;
    const sessionKey = params.get('session');
    const parsed = sessionKey ? parseSessionKey(sessionKey) : null;
    // The practice page sends the shift on its own (?shift=forenoon). Older
    // callers fold it into the session key ("Session 1 (Forenoon)").
    const shift = params.get('shift') || parsed?.shift || null;
    // Same values as nexus_qb_questions.section, comma-separated. Without it a
    // student scoped to one paper's Mathematics saw Aptitude and Drawing counts.
    const section = (params.get('section') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const { tree, counts } = await getQBSubjectTagTree(
      examType || section.length > 0
        ? {
            exam_type: examType,
            year: examType ? year : null,
            session: examType ? parsed?.session ?? null : null,
            shift: examType ? shift : null,
            section: section.length > 0 ? section : null,
          }
        : undefined,
    );

    return NextResponse.json(
      { data: counts, tree },
      {
        status: 200,
        // Facet data, not per-request truth. A minute of staleness is fine and
        // keeps repeated drawer opens off the function-invocation meter.
        headers: { 'Cache-Control': 'private, max-age=60' },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Category counts error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
