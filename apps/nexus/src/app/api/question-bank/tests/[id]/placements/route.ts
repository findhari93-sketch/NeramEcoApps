import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { createPlacement, listPlacementsForTest } from '@neram/database';
import type { NexusPlacementContext } from '@neram/database';

const CONTEXTS: NexusPlacementContext[] = [
  'study_file',
  'classroom_assignment',
  'class_recap_section',
  'foundation_section',
  'module_item',
  'student_practice',
];

/** GET /api/question-bank/tests/[id]/placements — where this test is used. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (!['teacher', 'admin'].includes(access.caller.user_type)) {
      return NextResponse.json({ error: 'Only teachers can view placements' }, { status: 403 });
    }
    const placements = await listPlacementsForTest(params.id);
    return NextResponse.json({ data: placements });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load placements';
    console.error('Placements GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/question-bank/tests/[id]/placements   (teacher/admin)
 * Place (attach) a test into a context.
 * Body: { context_type, context_id, passing_pct?, min_questions_to_pass?, sort_order?, is_visible?, gating? }
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (!['teacher', 'admin'].includes(access.caller.user_type)) {
      return NextResponse.json({ error: 'Only teachers can place tests' }, { status: 403 });
    }

    const body = await request.json();
    const { context_type, context_id, passing_pct, min_questions_to_pass, sort_order, is_visible, gating } = body || {};

    if (!CONTEXTS.includes(context_type)) {
      return NextResponse.json({ error: `context_type must be one of ${CONTEXTS.join(', ')}` }, { status: 400 });
    }
    if (!context_id || typeof context_id !== 'string') {
      return NextResponse.json({ error: 'context_id is required' }, { status: 400 });
    }

    const placement = await createPlacement({
      testId: params.id,
      contextType: context_type,
      contextId: context_id,
      passingPct: passing_pct ?? null,
      minQuestionsToPass: min_questions_to_pass ?? null,
      sortOrder: typeof sort_order === 'number' ? sort_order : 0,
      isVisible: is_visible ?? true,
      gating: gating ?? {},
      createdBy: access.caller.id,
    });
    return NextResponse.json({ data: placement }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to place test';
    if (/duplicate key|unique/i.test(message)) {
      return NextResponse.json({ error: 'This context already has a test placed. Remove it first.' }, { status: 409 });
    }
    console.error('Placements POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
