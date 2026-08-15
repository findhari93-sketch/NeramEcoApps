import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
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
  // resolveStaffRole rather than a user_type check: a manager row is
  // user_type='student' with staff_role='manager', so the old test 403d every
  // manager here while the bulk-delete route next door let them through. Same
  // capability, two answers, depending only on which button was pressed.
  if (resolveStaffRole(access.caller) === null) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Only staff can manage tests' }, { status: 403 }),
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
 * Whitelisted edits: { title?, description?, is_published?, passing_marks?, test_kind?,
 * questions_to_serve?, shuffle_questions?, shuffle_sections? }
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
      // updateTestMeta ignores anything outside the teacher-choosable list, so
      // a stray value here relabels nothing rather than 400ing.
      testKind: body?.test_kind || undefined,
      // Shared by every placement of this test (see updateTestMeta's own
      // comment) -- the Schedule dialog warns the teacher before sending these.
      questionsToServe: body?.questions_to_serve !== undefined ? body.questions_to_serve : undefined,
      shuffleQuestions: typeof body?.shuffle_questions === 'boolean' ? body.shuffle_questions : undefined,
      shuffleSections: typeof body?.shuffle_sections === 'boolean' ? body.shuffle_sections : undefined,
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

    await softDeleteTest(params.id, access.caller.id);
    return NextResponse.json({ data: { deleted: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete test';
    console.error('QB test DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
