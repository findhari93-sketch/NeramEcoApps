import { NextRequest, NextResponse } from 'next/server';
import {
  getTeachingPlanWithEntries,
  getTopicAuthoredContent,
  listDayItems,
  insertDayItems,
  updateDayItem,
  updatePlanEntry,
  logPlanAudit,
} from '@neram/database';
import type { NexusTeachingPlanEntryDetail } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { computeFlow, toFlowEntries, istToday } from '@/lib/plan-flow';
import { errorResponse } from '@/lib/api-errors';

/**
 * Pull checklist lines out of the topic's authored markdown: one item per
 * bullet ("- " / "* " / "1. "). Falls back to the topic title when nothing
 * parses.
 */
function parseAgendaLines(topic: { title: string; activities?: string | null; drills?: string | null }): string[] {
  const lines: string[] = [];
  for (const block of [topic.activities, topic.drills]) {
    if (!block) continue;
    for (const raw of block.split(/\r?\n/)) {
      const m = raw.match(/^\s*(?:[-*]|\d+[.)])\s+(.+)$/);
      if (m) {
        const text = m[1].replace(/\*\*/g, '').trim();
        if (text) lines.push(text.slice(0, 200));
      }
    }
  }
  return lines.length ? lines.slice(0, 20) : [topic.title];
}

async function loadDayContext(planId: string, date: string) {
  const plan = await getTeachingPlanWithEntries(planId);
  if (!plan) return null;
  const flow = computeFlow(toFlowEntries(plan.entries), {
    startDate: plan.start_date,
    saturdayClasses: plan.saturday_classes ?? true,
    today: istToday(),
  });
  const day = flow.days.find((d) => d.date === date && d.entryId) ?? null;
  const entry = day ? plan.entries.find((e) => e.id === day.entryId) ?? null : null;
  return { plan, flow, day, entry };
}

function dayPayload(
  ctx: NonNullable<Awaited<ReturnType<typeof loadDayContext>>>,
  items: Awaited<ReturnType<typeof listDayItems>>,
  date: string,
) {
  const classDayIndex = ctx.flow.days.filter((d) => d.date <= date && !d.isTest).length;
  return {
    date,
    day: ctx.day,
    entry: ctx.entry,
    items,
    class_day_index: classDayIndex,
    total_class_days: ctx.flow.days.filter((d) => !d.isTest).length,
  };
}

/**
 * GET /api/teaching-plans/[id]/class-day?date=YYYY-MM-DD  (staff)
 * The Class Day screen payload: the day's entry (with topic + linked scheduled
 * class), its agenda items (lazily seeded from the topic's activities/drills
 * markdown on first load), and the day's position in the plan.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);
    const date = request.nextUrl.searchParams.get('date') || istToday();

    const ctx = await loadDayContext(params.id, date);
    if (!ctx) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

    let items = await listDayItems(params.id, date);
    if (!items.length && ctx.entry && !ctx.day?.isTest) {
      const topic = (ctx.entry as NexusTeachingPlanEntryDetail).topic;
      if (topic) {
        // The plan payload's topic join is slim; pull the authored content here.
        const authored = await getTopicAuthoredContent(topic.id);
        const lines = parseAgendaLines({
          title: topic.title,
          activities: authored?.activities,
          drills: authored?.drills,
        });
        items = await insertDayItems(
          lines.map((title, i) => ({
            plan_id: params.id,
            entry_id: ctx.entry!.id,
            class_date: date,
            title,
            source: 'seeded' as const,
            position: (i + 1) * 10,
            created_by: user.id,
          })),
        );
      }
    }
    return NextResponse.json(dayPayload(ctx, items, date));
  } catch (err) {
    return errorResponse(err, 'Failed to load class day');
  }
}

/**
 * POST /api/teaching-plans/[id]/class-day  (staff)
 * body { action: 'set_item_status', item_id, status }        // pending|covered|partial|skipped
 * body { action: 'add_item', date, title, topic_id? }        // unplanned, added mid-class
 * body { action: 'end_class', date }                         // log coverage: completed_sessions += 1
 * body { action: 'carry_remaining', date }                   // needs one more class: session_span += 1
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);
    const body = await request.json();

    switch (body.action) {
      case 'set_item_status': {
        if (!['pending', 'covered', 'partial', 'skipped'].includes(body.status)) {
          return NextResponse.json({ error: 'Bad status' }, { status: 400 });
        }
        const item = await updateDayItem(body.item_id, { status: body.status });
        return NextResponse.json({ item });
      }

      case 'add_item': {
        if (!body.date || !body.title?.trim()) {
          return NextResponse.json({ error: 'Date and title are required' }, { status: 400 });
        }
        const existing = await listDayItems(params.id, body.date);
        const maxPos = existing.reduce((m, i) => Math.max(m, i.position), 0);
        const ctx = await loadDayContext(params.id, body.date);
        const [item] = await insertDayItems([
          {
            plan_id: params.id,
            entry_id: ctx?.entry?.id ?? null,
            class_date: body.date,
            title: body.title.trim().slice(0, 200),
            topic_id: body.topic_id ?? null,
            is_unplanned: true,
            source: 'manual',
            position: maxPos + 10,
            created_by: user.id,
          },
        ]);
        return NextResponse.json({ item });
      }

      case 'end_class': {
        const date = body.date || istToday();
        const ctx = await loadDayContext(params.id, date);
        if (!ctx) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
        if (!ctx.entry || ctx.day?.isTest) {
          return NextResponse.json({ error: 'No class planned on this day' }, { status: 400 });
        }
        const span = Math.max(
          1,
          ctx.entry.session_span ??
            (ctx.entry as NexusTeachingPlanEntryDetail).topic?.estimated_sessions ??
            1,
        );
        const completed = Math.min((ctx.entry.completed_sessions ?? 0) + 1, span);
        const finished = completed >= span;
        const entry = await updatePlanEntry(ctx.entry.id, {
          completed_sessions: completed,
          ...(finished ? { status: 'done' } : {}),
        });
        const label =
          (ctx.entry as NexusTeachingPlanEntryDetail).topic?.title || ctx.entry.label || 'the class';
        await logPlanAudit({
          plan_id: params.id,
          entry_id: ctx.entry.id,
          action: 'coverage_logged',
          performed_by: user.id,
          metadata: {
            summary: `logged coverage for ${label}, day ${completed} of ${span}`,
            date,
            completed_sessions: completed,
            done: finished,
          },
        });
        return NextResponse.json({ entry, finished });
      }

      case 'carry_remaining': {
        const date = body.date || istToday();
        const ctx = await loadDayContext(params.id, date);
        if (!ctx) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
        if (!ctx.entry || ctx.day?.isTest) {
          return NextResponse.json({ error: 'No class planned on this day' }, { status: 400 });
        }
        const span = Math.max(
          1,
          ctx.entry.session_span ??
            (ctx.entry as NexusTeachingPlanEntryDetail).topic?.estimated_sessions ??
            1,
        );
        const entry = await updatePlanEntry(ctx.entry.id, { session_span: span + 1 });
        const pending = (await listDayItems(params.id, date)).filter(
          (i) => i.status === 'pending' || i.status === 'partial',
        ).length;
        const label =
          (ctx.entry as NexusTeachingPlanEntryDetail).topic?.title || ctx.entry.label || 'the class';
        await logPlanAudit({
          plan_id: params.id,
          entry_id: ctx.entry.id,
          action: 'carried',
          performed_by: user.id,
          metadata: {
            summary: `carried ${pending || 'the remaining'} ${pending === 1 ? 'item' : 'items'} of ${label} to the next class, later classes shifted`,
            date,
            new_span: span + 1,
          },
        });
        return NextResponse.json({ entry });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    return errorResponse(err, 'Failed to save');
  }
}
