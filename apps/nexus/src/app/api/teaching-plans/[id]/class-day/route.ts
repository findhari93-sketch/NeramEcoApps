import { NextRequest, NextResponse } from 'next/server';
import {
  getTeachingPlanWithEntries,
  getTopicAuthoredContent,
  listDayItems,
  insertDayItems,
  updateDayItem,
  updatePlanEntry,
  logPlanAudit,
  listAssignmentsForPlan,
  createAssignment,
  createScheduledClass,
  updateScheduledClassLinks,
  getRecapByClass,
} from '@neram/database';
import type { NexusTeachingPlanEntryDetail } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { computeFlow, toFlowEntries, istToday } from '@/lib/plan-flow';
import { errorResponse } from '@/lib/api-errors';
import { buildClassLinkPatch } from '@/lib/class-links';

/** The scheduled class linked to this entry on this specific date (spillover-safe). */
function matchedClass(
  entry: NexusTeachingPlanEntryDetail | null,
  date: string,
): NexusTeachingPlanEntryDetail['classes'][number] | null {
  if (!entry) return null;
  return (entry.classes || []).find((c) => c.scheduled_date === date) ?? null;
}

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
    // Assignments given on this day + the class links (Teams + YouTube) and any
    // existing recap for the scheduled class.
    const [assignments, cls] = [
      await listAssignmentsForPlan(params.id, [date]),
      matchedClass(ctx.entry as NexusTeachingPlanEntryDetail | null, date),
    ];
    const recap = cls ? await getRecapByClass(cls.id) : null;
    const classLinks = cls
      ? { class_id: cls.id, recording_url: cls.recording_url, youtube_url: cls.youtube_url }
      : null;

    return NextResponse.json({
      ...dayPayload(ctx, items, date),
      assignments,
      class_links: classLinks,
      recap: recap ? { id: recap.id, status: recap.status } : null,
    });
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
 * body { action: 'backfill_class', date, start_time?, end_time? }  // past class taught in Teams: create a completed class row (no Teams), mark the session covered
 * body { action: 'set_class_links', class_id, recording_url?, youtube_url? }
 * body { action: 'create_assignment', date, title, instructions?, submission_format?, max_marks?, due_at?, topic_id? }
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

      case 'backfill_class': {
        // A class was taught directly in Teams on a past date, so no scheduled
        // class row exists. Create a lightweight completed class (no Teams
        // meeting) so a recording can hang off it, and count the session as
        // covered. Future dates use "Schedule the class" instead.
        const date = body.date || istToday();
        if (date > istToday()) {
          return NextResponse.json(
            { error: 'This class is in the future. Use Schedule the class instead.' },
            { status: 400 },
          );
        }
        const ctx = await loadDayContext(params.id, date);
        if (!ctx) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
        if (!ctx.entry || ctx.day?.isTest) {
          return NextResponse.json({ error: 'No class planned on this day' }, { status: 400 });
        }
        const topic = (ctx.entry as NexusTeachingPlanEntryDetail).topic;
        const existing = matchedClass(ctx.entry as NexusTeachingPlanEntryDetail, date);
        let classId = existing?.id ?? null;
        if (!classId) {
          const cls = await createScheduledClass({
            classroom_id: ctx.plan.classroom_id,
            teacher_id: user.id,
            title: topic?.title || ctx.entry.label || 'Class',
            description: null,
            scheduled_date: date,
            start_time: body.start_time || '19:00',
            end_time: body.end_time || '20:30',
            status: 'completed',
            plan_entry_id: ctx.entry.id,
            course_topic_id: ctx.entry.topic_id,
          });
          classId = (cls as { id: string }).id;
          // Count this session as covered the first time we backfill its date.
          const span = Math.max(1, ctx.entry.session_span ?? topic?.estimated_sessions ?? 1);
          const completed = Math.min((ctx.entry.completed_sessions ?? 0) + 1, span);
          const finished = completed >= span;
          await updatePlanEntry(ctx.entry.id, {
            completed_sessions: completed,
            ...(finished ? { status: 'done' } : {}),
          });
          await logPlanAudit({
            plan_id: params.id,
            entry_id: ctx.entry.id,
            action: 'coverage_logged',
            performed_by: user.id,
            metadata: {
              summary: `marked ${topic?.title || ctx.entry.label || 'the class'} taught on ${date} and opened a recording slot`,
              date,
              completed_sessions: completed,
              done: finished,
              backfilled: true,
            },
          });
        }
        return NextResponse.json({ ok: true, class_id: classId });
      }

      case 'set_class_links': {
        if (!body.class_id) {
          return NextResponse.json({ error: 'class_id is required' }, { status: 400 });
        }
        // Shared with the timetable's wrap-up, so both write the same shape.
        const result = buildClassLinkPatch(body);
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
        await updateScheduledClassLinks(body.class_id, result.patch);
        return NextResponse.json({ ok: true, ...result.patch });
      }

      case 'create_assignment': {
        const date = body.date || istToday();
        const title = String(body.title || '').trim();
        if (!title) {
          return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }
        const format = body.submission_format === 'pdf' ? 'pdf' : 'pdf_or_image';
        const maxMarks = Number(body.max_marks);
        const ctx = await loadDayContext(params.id, date);
        if (!ctx) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
        const topicId =
          body.topic_id ?? (ctx.entry as NexusTeachingPlanEntryDetail | null)?.topic?.id ?? null;
        const assignment = await createAssignment({
          classroom_id: ctx.plan.classroom_id,
          plan_id: params.id,
          plan_entry_id: ctx.entry?.id ?? null,
          topic_id: topicId,
          class_date: date,
          title,
          instructions: body.instructions ? String(body.instructions) : null,
          submission_format: format,
          max_marks: Number.isFinite(maxMarks) && maxMarks > 0 ? maxMarks : 10,
          due_at: body.due_at || null,
          created_by: user.id,
        });
        return NextResponse.json({ assignment });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    return errorResponse(err, 'Failed to save');
  }
}
