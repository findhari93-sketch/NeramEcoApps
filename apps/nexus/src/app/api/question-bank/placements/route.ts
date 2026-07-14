import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { getPlacementsByContext, getTestMeta, getComposedTestQuestions } from '@neram/database';
import type { NexusPlacementContext } from '@neram/database';

/**
 * GET /api/question-bank/placements?context_type=&context_id=
 * Resolve the test(s) placed in a context, with student-safe question payloads
 * (no correct answers). Used by every take-test surface.
 */
export async function GET(request: NextRequest) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;

    const { searchParams } = new URL(request.url);
    const contextType = searchParams.get('context_type') as NexusPlacementContext | null;
    const contextId = searchParams.get('context_id');
    if (!contextType || !contextId) {
      return NextResponse.json({ error: 'context_type and context_id are required' }, { status: 400 });
    }

    const placements = await getPlacementsByContext(contextType, contextId);
    const visible = placements.filter((p) => p.is_visible);
    if (visible.length === 0) return NextResponse.json({ data: { placements: [] } });

    const resolved = await Promise.all(
      visible.map(async (p) => {
        const [test, questions] = await Promise.all([
          getTestMeta(p.test_id),
          getComposedTestQuestions(p.test_id, false), // student-safe: no answers
        ]);
        return { placement: p, test, questions };
      }),
    );

    // Only surface placements whose test is published + active.
    const available = resolved.filter((r) => r.test && r.test.is_published && r.test.is_active);
    return NextResponse.json({ data: { placements: available } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve placement';
    console.error('Placements resolve error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
