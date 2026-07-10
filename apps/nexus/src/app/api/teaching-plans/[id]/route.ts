import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getTeachingPlanWithEntries,
  updateTeachingPlan,
  deleteTeachingPlan,
  addPlanEntries,
  updatePlanEntry,
  removePlanEntry,
  reorderPlanEntry,
  listPlanAudit,
  logPlanAudit,
  getPlanMeta,
  getPlanEntryWithRefs,
  publishTopicsAsSelfLearning,
  addPlanScheduleOverride,
  removePlanScheduleOverride,
} from '@neram/database';
import type { NexusPlanAuditAction } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { computeFlow, toFlowEntries, istToday } from '@/lib/plan-flow';
import { errorResponse } from '@/lib/api-errors';

/** Label used in audit rows: the entry's topic title, test title, or free label. */
function entryLabel(entry: {
  label?: string | null;
  topic?: { title?: string } | null;
  test?: { title?: string } | null;
}): string {
  return entry.topic?.title || entry.test?.title || entry.label || 'entry';
}

/**
 * Load the plan and run the flow engine over its queue, for server-side
 * validation of edits (locked past entries, insert boundaries).
 */
async function loadFlow(planId: string) {
  const plan = await getTeachingPlanWithEntries(planId);
  if (!plan) return null;
  const overrides = plan.schedule_overrides ?? [];
  const flow = computeFlow(toFlowEntries(plan.entries), {
    startDate: plan.start_date,
    saturdayClasses: plan.saturday_classes ?? true,
    today: istToday(),
    draft: plan.status === 'draft',
    holidays: overrides.filter((o) => o.kind === 'cancelled').map((o) => o.date),
    extraDays: overrides.filter((o) => o.kind === 'makeup').map((o) => o.date),
  });
  return { plan, flow };
}

/**
 * GET /api/teaching-plans/[id]  (staff)
 * The whole plan payload in one call: plan + entries (with topics, modules, linked classes),
 * the activity feed, org teachers (for the schedule dialog) and the classroom's tests.
 * The Builder, Schedule and Health screens all render from this single response.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const plan = await getTeachingPlanWithEntries(params.id);
    if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

    const supabase = getSupabaseAdminClient();
    const [audit, teachersRes, testsRes] = await Promise.all([
      listPlanAudit(params.id),
      supabase
        .from('users')
        .select('id, name, avatar_url')
        .in('user_type', ['teacher', 'admin'])
        .order('name'),
      supabase
        .from('nexus_tests')
        .select('id, title')
        .eq('classroom_id', plan.classroom_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
    ]);

    return NextResponse.json({
      plan,
      audit,
      teachers: teachersRes.data || [],
      tests: testsRes.data || [],
    });
  } catch (err) {
    return errorResponse(err, 'Failed to load plan');
  }
}

/**
 * PATCH /api/teaching-plans/[id]  (staff) — plan meta. Setting status 'active' stamps
 * activated_at and logs the activation.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);
    const body = await request.json();
    const updates: Record<string, unknown> = {};
    for (const key of [
      'title',
      'exam_type',
      'start_date',
      'expected_end_date',
      'status',
      'saturday_classes',
      'exam_date',
    ] as const) {
      if (key in body) updates[key] = body[key];
    }
    if (updates.status === 'active') updates.activated_at = new Date().toISOString();
    const plan = await updateTeachingPlan(params.id, updates);
    await logPlanAudit({
      plan_id: params.id,
      action: updates.status === 'active' ? 'activated' : updates.status === 'completed' ? 'completed' : 'edited',
      performed_by: user.id,
      metadata: {
        summary:
          updates.status === 'active'
            ? 'made the plan Active'
            : updates.status === 'completed'
              ? 'marked the plan Completed'
              : updates.status === 'archived'
                ? 'archived the plan'
                : updates.status === 'draft'
                  ? 'restored the plan'
                  : 'edited the plan details',
      },
    });
    return NextResponse.json({ plan });
  } catch (err) {
    return errorResponse(err, 'Failed to update plan');
  }
}

/**
 * DELETE /api/teaching-plans/[id]  (staff) — permanently removes a plan.
 * Guarded: only archived plans can be hard-deleted (active/draft/completed
 * must be archived first). Cascade removes entries, audit log, day items and
 * catch-up; scheduled classes survive (plan_entry_id is set null).
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);
    const meta = await getPlanMeta(params.id);
    if (!meta) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    if (meta.status !== 'archived') {
      return NextResponse.json(
        { error: 'Only archived plans can be deleted. Archive it first.' },
        { status: 400 },
      );
    }
    await deleteTeachingPlan(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 'Failed to delete plan');
  }
}

/**
 * POST /api/teaching-plans/[id]  (staff) — queue operations, each writing an audit row.
 * body { action: 'add_entries', entries: [...], after_position? }   // insert into the queue
 * body { action: 'reorder_entry', entry_id, after_entry_id? | to_start? }
 * body { action: 'set_entry_date', entry_id, date }                 // put any entry on a date (null clears)
 * body { action: 'set_span', entry_id, session_span }               // how many class days
 * body { action: 'set_status', entry_id, status, notes? }           // done | skipped | planned
 * body { action: 'convert', entry_id, entry_type, publish? }        // live_class <-> self_learning
 * body { action: 'remove_entry', entry_id }                         // returns to repository
 *
 * On active plans, edits that touch the locked past (entries already taught) are rejected;
 * the flow engine re-runs server-side to enforce it.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);
    const body = await request.json();

    const loadEntry = (entryId: string) => getPlanEntryWithRefs(entryId);
    const log = (action: NexusPlanAuditAction, metadata: Record<string, unknown>, entryId?: string | null) =>
      logPlanAudit({ plan_id: params.id, entry_id: entryId ?? null, action, performed_by: user.id, metadata });

    switch (body.action) {
      case 'add_entries': {
        if (!Array.isArray(body.entries) || body.entries.length === 0) {
          return NextResponse.json({ error: 'No entries to add' }, { status: 400 });
        }
        const ctx = await loadFlow(params.id);
        if (!ctx) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
        const isUnplanned = ctx.plan.status === 'active';

        let afterPosition: number | undefined = body.after_position;
        // Never insert before an already-taught entry.
        const lockBoundary = ctx.plan.entries
          .filter((e) => ctx.flow.lockedEntryIds.has(e.id))
          .reduce((max, e) => Math.max(max, e.position), 0);
        if (afterPosition !== undefined && afterPosition < lockBoundary) {
          return NextResponse.json(
            { error: 'Cannot insert before classes that already happened' },
            { status: 400 },
          );
        }
        const entries = await addPlanEntries(
          params.id,
          body.entries.map((e: Record<string, unknown>) => ({ ...e, is_unplanned: isUnplanned })),
          afterPosition !== undefined ? { afterPosition } : undefined,
        );
        const first = await loadEntry(entries[0].id);
        await log('added_entry', {
          summary:
            entries.length === 1
              ? `placed ${entryLabel(first || {})} into the plan, later classes shifted`
              : `added ${entries.length} entries to the plan`,
          ...(isUnplanned ? { unplanned: true } : {}),
        });
        return NextResponse.json({ entries });
      }

      case 'reorder_entry': {
        const before = await loadEntry(body.entry_id);
        if (!before) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        const ctx = await loadFlow(params.id);
        if (!ctx) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
        if (ctx.flow.lockedEntryIds.has(body.entry_id)) {
          return NextResponse.json(
            { error: 'This class already happened and cannot be moved' },
            { status: 400 },
          );
        }
        if (body.after_entry_id && ctx.flow.lockedEntryIds.has(body.after_entry_id)) {
          // Landing right after a locked entry is fine only if it is the LAST locked one.
          const lockedPositions = ctx.plan.entries
            .filter((e) => ctx.flow.lockedEntryIds.has(e.id))
            .map((e) => e.position);
          const target = ctx.plan.entries.find((e) => e.id === body.after_entry_id);
          if (target && target.position < Math.max(...lockedPositions)) {
            return NextResponse.json(
              { error: 'Cannot move a class into the locked past' },
              { status: 400 },
            );
          }
        }
        if (!body.after_entry_id && ctx.flow.lockedEntryIds.size > 0) {
          return NextResponse.json(
            { error: 'Cannot move a class before classes that already happened' },
            { status: 400 },
          );
        }
        const position = await reorderPlanEntry(params.id, body.entry_id, {
          afterEntryId: body.after_entry_id ?? null,
          toStart: !body.after_entry_id,
        });
        await log(
          'reordered',
          { summary: `moved ${entryLabel(before)}, dates recalculated` },
          body.entry_id,
        );
        return NextResponse.json({ entry_id: body.entry_id, position });
      }

      // Put any entry (topic, task or test) on a specific calendar date, so
      // other classes flow around it. Passing a null date clears the pin and
      // returns the entry to auto-flow. 'pin_test' is kept as an alias.
      case 'set_entry_date':
      case 'pin_test': {
        const before = await loadEntry(body.entry_id);
        if (!before) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        const newDate: string | null = body.pinned_date ?? body.date ?? null;
        if (newDate && !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
          return NextResponse.json({ error: 'A valid date is required' }, { status: 400 });
        }
        // On a live (non-draft) plan, history is protected: a class that has
        // already happened cannot be re-dated, and nothing can be pinned into
        // the past. Drafts are still being assembled, so any date is allowed.
        const ctx = await loadFlow(params.id);
        if (ctx && ctx.plan.status !== 'draft') {
          if (ctx.flow.lockedEntryIds.has(body.entry_id)) {
            return NextResponse.json(
              { error: 'This class already happened and cannot be re-dated' },
              { status: 400 },
            );
          }
          if (newDate && newDate < istToday()) {
            return NextResponse.json({ error: 'Pick a date that is not in the past' }, { status: 400 });
          }
        }
        const entry = await updatePlanEntry(body.entry_id, { planned_date: newDate });
        await log(
          'pinned',
          {
            summary: newDate
              ? `set ${entryLabel(before)} to ${newDate}`
              : `cleared the date on ${entryLabel(before)}, back to auto-flow`,
            from: before.planned_date,
            to: newDate,
          },
          body.entry_id,
        );
        return NextResponse.json({ entry });
      }

      // Edit an info task's fields (title / description / time / date).
      case 'update_task': {
        const before = await loadEntry(body.entry_id);
        if (!before) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        if (before.entry_type !== 'task') {
          return NextResponse.json({ error: 'Only tasks can be edited this way' }, { status: 400 });
        }
        const newDate: string | null = body.planned_date ?? null;
        if (newDate && !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
          return NextResponse.json({ error: 'A valid date is required' }, { status: 400 });
        }
        const ctx = await loadFlow(params.id);
        if (ctx && ctx.plan.status !== 'draft' && ctx.flow.lockedEntryIds.has(body.entry_id)) {
          return NextResponse.json({ error: 'This task is in the past and cannot be edited' }, { status: 400 });
        }
        const entry = await updatePlanEntry(body.entry_id, {
          label: body.label ?? null,
          notes: body.notes ?? null,
          task_time: body.task_time ?? null,
          planned_date: newDate,
        });
        await log('edited', { summary: `edited the task ${(body.label ?? '').trim() || '(untitled)'}` }, body.entry_id);
        return NextResponse.json({ entry });
      }

      case 'set_span': {
        const before = await loadEntry(body.entry_id);
        if (!before) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        const span = Number(body.session_span);
        if (!Number.isInteger(span) || span < 1 || span > 30) {
          return NextResponse.json({ error: 'session_span must be between 1 and 30' }, { status: 400 });
        }
        if (span < (before.completed_sessions ?? 0)) {
          return NextResponse.json(
            { error: 'Span cannot be smaller than the sessions already taught' },
            { status: 400 },
          );
        }
        const entry = await updatePlanEntry(body.entry_id, { session_span: span });
        await log(
          'edited',
          { summary: `set ${entryLabel(before)} to ${span} ${span === 1 ? 'class' : 'classes'}` },
          body.entry_id,
        );
        return NextResponse.json({ entry });
      }

      case 'set_status': {
        const before = await loadEntry(body.entry_id);
        if (!before) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        if (!['planned', 'done', 'skipped'].includes(body.status)) {
          return NextResponse.json({ error: 'Unsupported status' }, { status: 400 });
        }
        const entry = await updatePlanEntry(body.entry_id, {
          status: body.status,
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
        });
        await log(
          'status_changed',
          {
            summary:
              body.status === 'skipped'
                ? `skipped ${entryLabel(before)}, later classes moved up`
                : `marked ${entryLabel(before)} as ${body.status}`,
            from: before.status,
            to: body.status,
            ...(body.notes ? { notes: body.notes } : {}),
          },
          body.entry_id,
        );
        return NextResponse.json({ entry });
      }

      case 'convert': {
        const before = await loadEntry(body.entry_id);
        if (!before) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        const entry = await updatePlanEntry(body.entry_id, { entry_type: body.entry_type });
        // publish: make the topic a self-learning module students can see.
        if (body.publish && before.topic_id && body.entry_type === 'self_learning') {
          await publishTopicsAsSelfLearning([before.topic_id]);
        }
        await log(
          'converted',
          {
            summary: `converted ${entryLabel(before)} to ${body.entry_type === 'self_learning' ? 'self-learning' : 'a live class'}${body.publish ? ' and shared it with students' : ''}`,
            from: before.entry_type,
            to: body.entry_type,
          },
          body.entry_id,
        );
        return NextResponse.json({ entry });
      }

      case 'remove_entry': {
        const before = await loadEntry(body.entry_id);
        if (!before) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        const ctx = await loadFlow(params.id);
        if (ctx?.flow.lockedEntryIds.has(body.entry_id)) {
          return NextResponse.json(
            { error: 'This class already happened and cannot be removed' },
            { status: 400 },
          );
        }
        await removePlanEntry(body.entry_id);
        await log('removed_entry', {
          summary: `removed ${entryLabel(before)}, returned to repository`,
        });
        return NextResponse.json({ ok: true });
      }

      case 'cancel_class': {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '')) {
          return NextResponse.json({ error: 'A valid date is required' }, { status: 400 });
        }
        const override = await addPlanScheduleOverride({
          plan_id: params.id,
          date: body.date,
          kind: 'cancelled',
          reason: body.reason ?? null,
          created_by: user.id,
        });
        await log('edited', {
          summary: `cancelled the class on ${body.date}, later classes moved forward`,
          date: body.date,
          ...(body.reason ? { notes: body.reason } : {}),
        });
        return NextResponse.json({ override });
      }

      case 'add_makeup': {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '')) {
          return NextResponse.json({ error: 'A valid date is required' }, { status: 400 });
        }
        const override = await addPlanScheduleOverride({
          plan_id: params.id,
          date: body.date,
          kind: 'makeup',
          reason: body.reason ?? null,
          created_by: user.id,
        });
        await log('edited', {
          summary: `added a makeup class on ${body.date}, the plan catches up`,
          date: body.date,
          ...(body.reason ? { notes: body.reason } : {}),
        });
        return NextResponse.json({ override });
      }

      case 'remove_override': {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '')) {
          return NextResponse.json({ error: 'A valid date is required' }, { status: 400 });
        }
        await removePlanScheduleOverride(params.id, body.date);
        await log('edited', { summary: `cleared the schedule change on ${body.date}`, date: body.date });
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    return errorResponse(err, 'Failed to save');
  }
}
