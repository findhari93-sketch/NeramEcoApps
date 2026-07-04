import { NextRequest, NextResponse } from 'next/server';
import {
  createScheduledClass,
  updatePlanEntry,
  logPlanAudit,
  getPlanMeta,
  getPlanEntryWithRefs,
} from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';

/**
 * POST /api/teaching-plans/[id]/schedule  (staff)
 * The plan -> timetable bridge: creates a nexus_scheduled_classes row from a plan entry and
 * flips the entry to 'scheduled'. Scheduling the same entry again is allowed (spillover
 * continuation) and just links another class.
 *
 * body { entry_id, scheduled_date, start_time, end_time, teacher_id }
 *
 * Teams meetings are NOT created here: after this succeeds, the client calls the existing
 * POST /api/timetable/teams-meeting with the returned class id (scopes: link_only |
 * channel_meeting | calendar_event), so no Graph code is duplicated.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);
    const body = await request.json();
    if (!body.entry_id || !body.scheduled_date || !body.start_time || !body.end_time) {
      return NextResponse.json(
        { error: 'Entry, date, start time and end time are required' },
        { status: 400 },
      );
    }

    const plan = await getPlanMeta(params.id);
    if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

    const entry = await getPlanEntryWithRefs(body.entry_id);
    if (!entry || entry.plan_id !== params.id) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    const title =
      (entry.topic?.title || entry.test?.title || entry.label || 'Class') +
      (entry.label && entry.topic ? ` (${entry.label})` : '');

    const cls = await createScheduledClass({
      classroom_id: plan.classroom_id,
      teacher_id: body.teacher_id || user.id,
      title,
      description: entry.topic?.summary || null,
      scheduled_date: body.scheduled_date,
      start_time: body.start_time,
      end_time: body.end_time,
      status: 'scheduled',
      plan_entry_id: entry.id,
      course_topic_id: entry.topic_id,
    });

    // planned_date stays untouched: in the auto-flow model it is the pinned
    // date of test entries only; topic dates are computed from queue order.
    const updated = await updatePlanEntry(entry.id, { status: 'scheduled' });

    await logPlanAudit({
      plan_id: params.id,
      entry_id: entry.id,
      action: 'scheduled_class',
      performed_by: user.id,
      metadata: {
        summary: `scheduled ${entry.topic?.title || entry.test?.title || entry.label || 'a class'}`,
        date: body.scheduled_date,
        time: `${body.start_time} to ${body.end_time}`,
        class_id: cls.id,
      },
    });

    return NextResponse.json({ class: cls, entry: updated });
  } catch (err) {
    return errorResponse(err, 'Failed to schedule class');
  }
}
