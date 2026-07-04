import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getTeachingPlanWithEntries,
  updateTeachingPlan,
  addPlanEntries,
  updatePlanEntry,
  removePlanEntry,
  reorderPlanEntry,
  listPlanAudit,
  logPlanAudit,
  getPlanMeta,
  getPlanEntryWithRefs,
  publishTopicsAsSelfLearning,
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
  const flow = computeFlow(toFlowEntries(plan.entries), {
    startDate: plan.start_date,
    saturdayClasses: plan.saturday_classes ?? true,
    today: istToday(),
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
              : 'edited the plan details',
      },
    });
    return NextResponse.json({ plan });
  } catch (err) {
    return errorResponse(err, 'Failed to update plan');
  }
}

/**
 * POST /api/teaching-plans/[id]  (staff) — queue operations, each writing an audit row.
 * body { action: 'add_entries', entries: [...], after_position? }   // insert into the queue
 * body { action: 'reorder_entry', entry_id, after_entry_id? | to_start? }
 * body { action: 'pin_test', entry_id, pinned_date }                // tests sit on fixed dates
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

      case 'pin_test': {
        const before = await loadEntry(body.entry_id);
        if (!before) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        if (before.entry_type !== 'test') {
          return NextResponse.json({ error: 'Only tests can be pinned to a date' }, { status: 400 });
        }
        const entry = await updatePlanEntry(body.entry_id, { planned_date: body.pinned_date ?? null });
        await log(
          'pinned',
          {
            summary: body.pinned_date
              ? `pinned ${entryLabel(before)} to ${body.pinned_date}`
              : `unpinned ${entryLabel(before)}`,
            from: before.planned_date,
            to: body.pinned_date ?? null,
          },
          body.entry_id,
        );
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

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    return errorResponse(err, 'Failed to save');
  }
}
