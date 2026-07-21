import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import {
  getTestMeta,
  getComposedTestQuestions,
  listPlacementsForTest,
  updateTestMeta,
  softDeleteTest,
  countTestAttempts,
} from '@neram/database';

async function requireStaff(request: NextRequest) {
  const access = await verifyQBAccess(request.headers.get('Authorization'), null);
  if (!access.ok) return { ok: false as const, response: access.response };
  if (!['teacher', 'admin'].includes(access.caller.user_type)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Only teachers can manage tests' }, { status: 403 }),
    };
  }
  return { ok: true as const, caller: access.caller };
}

/**
 * GET /api/question-bank/tests/[id]   (teacher/admin)
 * Full test + questions (with answers) + placements + attempts count.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await requireStaff(request);
    if (!access.ok) return access.response;

    const meta = await getTestMeta(params.id);
    if (!meta) return NextResponse.json({ error: 'Test not found' }, { status: 404 });

    const [questions, placements, attemptsCount] = await Promise.all([
      getComposedTestQuestions(params.id, true),
      listPlacementsForTest(params.id),
      countTestAttempts(params.id),
    ]);

    return NextResponse.json({ data: { test: meta, questions, placements, attempts_count: attemptsCount } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load test';
    console.error('QB test GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/question-bank/tests/[id]   (teacher/admin)
 * Whitelisted edits: { title?, description?, is_published?, passing_marks? }
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await requireStaff(request);
    if (!access.ok) return access.response;

    const body = await request.json();
    const updated = await updateTestMeta(params.id, {
      title: typeof body?.title === 'string' ? body.title : undefined,
      description: body?.description !== undefined ? body.description : undefined,
      isPublished: typeof body?.is_published === 'boolean' ? body.is_published : undefined,
      passingMarks: body?.passing_marks !== undefined ? body.passing_marks : undefined,
    });
    if (!updated) return NextResponse.json({ error: 'Test not found' }, { status: 404 });
    return NextResponse.json({ data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update test';
    console.error('QB test PATCH error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/question-bank/tests/[id]   (teacher/admin)
 * Soft delete: deactivates the test and all of its placements.
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await requireStaff(request);
    if (!access.ok) return access.response;

    const meta = await getTestMeta(params.id);
    if (!meta) return NextResponse.json({ error: 'Test not found' }, { status: 404 });

    await softDeleteTest(params.id);
    return NextResponse.json({ data: { deleted: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete test';
    console.error('QB test DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
