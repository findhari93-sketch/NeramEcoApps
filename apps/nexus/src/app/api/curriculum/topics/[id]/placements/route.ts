import { NextRequest, NextResponse } from 'next/server';
import { getTopicPlacements, getTeachingPlanWithEntries } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { computeFlow, toFlowEntries, istToday } from '@/lib/plan-flow';
import { errorResponse } from '@/lib/api-errors';

/**
 * GET /api/curriculum/topics/[id]/placements  (staff)
 * "Where this is taught": every plan this topic sits in, with the class-day date
 * (recomputed from the flow engine since topic dates aren't stored) and whether a
 * recording is attached, so the repository can deep-link to each class day.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);
    const today = istToday();

    const placements = await getTopicPlacements(params.id);
    // Recompute each plan's flow once (a topic sits in few plans in practice).
    const flowCache = new Map<string, ReturnType<typeof computeFlow> | null>();
    const result = [];
    for (const p of placements) {
      if (!p.plan) continue;
      if (!flowCache.has(p.plan_id)) {
        const full = await getTeachingPlanWithEntries(p.plan_id);
        flowCache.set(
          p.plan_id,
          full
            ? computeFlow(toFlowEntries(full.entries), {
                startDate: full.start_date,
                saturdayClasses: full.saturday_classes ?? true,
                today,
              })
            : null,
        );
      }
      const flow = flowCache.get(p.plan_id);
      const computedDates = flow?.entryDates.get(p.entry_id) ?? [];
      const scheduledDates = p.classes.map((c) => c.scheduled_date).sort();
      // A scheduled class date is authoritative; else use the computed first day.
      const date = scheduledDates[0] || computedDates[0] || null;
      result.push({
        entry_id: p.entry_id,
        plan: { id: p.plan.id, title: p.plan.title, status: p.plan.status },
        entry_status: p.status,
        session_span: p.session_span,
        completed_sessions: p.completed_sessions,
        date,
        is_past: date ? date < today : false,
        has_recording: p.classes.some((c) => c.recording_url || c.youtube_url),
      });
    }

    // Newest-relevant first: past classes (already taught) above upcoming.
    result.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    return NextResponse.json({ placements: result });
  } catch (err) {
    return errorResponse(err, 'Failed to load placements');
  }
}
