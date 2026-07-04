import { NextRequest, NextResponse } from 'next/server';
import {
  listTeachingPlans,
  createTeachingPlan,
  getTeachingPlanWithEntries,
  addPlanEntries,
  logPlanAudit,
} from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';

/**
 * GET /api/teaching-plans?classroom_id=<id>&include_archived=1  (staff)
 * Plan cards with progress + content counts for the overview screen.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);
    const classroomId = request.nextUrl.searchParams.get('classroom_id');
    const includeArchived = request.nextUrl.searchParams.get('include_archived') === '1';
    const plans = await listTeachingPlans(classroomId, undefined, { includeArchived });
    return NextResponse.json({ plans });
  } catch (err) {
    return errorResponse(err, 'Failed to load plans');
  }
}

/**
 * POST /api/teaching-plans  (staff)
 * body { classroom_id, title, exam_type?, start_date, expected_end_date,
 *        saturday_classes?, exam_date?, duplicate_from? }
 * duplicate_from: copy another plan's queue (statuses and coverage reset) as a template.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);
    const body = await request.json();
    if (!body.classroom_id || !body.title?.trim() || !body.start_date || !body.expected_end_date) {
      return NextResponse.json(
        { error: 'Classroom, title, start date and expected completion date are required' },
        { status: 400 },
      );
    }
    const plan = await createTeachingPlan({
      classroom_id: body.classroom_id,
      title: body.title.trim(),
      exam_type: body.exam_type,
      start_date: body.start_date,
      expected_end_date: body.expected_end_date,
      created_by: user.id,
      ...(body.saturday_classes !== undefined ? { saturday_classes: !!body.saturday_classes } : {}),
      ...(body.exam_date ? { exam_date: body.exam_date } : {}),
    } as Parameters<typeof createTeachingPlan>[0]);

    let copied = 0;
    if (body.duplicate_from) {
      const source = await getTeachingPlanWithEntries(body.duplicate_from);
      if (source?.entries.length) {
        const toCopy = source.entries.map((e) => ({
          topic_id: e.topic_id,
          test_id: e.test_id,
          label: e.label,
          entry_type: e.entry_type,
          // Pinned dates belong to the old calendar; the new plan re-pins its tests.
          planned_date: null,
          session_span: e.session_span,
        }));
        const rows = await addPlanEntries(plan.id, toCopy);
        copied = rows.length;
      }
    }

    await logPlanAudit({
      plan_id: plan.id,
      action: 'created',
      performed_by: user.id,
      metadata: {
        summary: body.duplicate_from
          ? `created the plan ${plan.title} from a template (${copied} entries copied)`
          : `created the plan ${plan.title}`,
        from: plan.start_date,
        to: plan.expected_end_date,
      },
    });
    return NextResponse.json({ plan });
  } catch (err) {
    return errorResponse(err, 'Failed to create plan');
  }
}
