import { NextRequest, NextResponse } from 'next/server';
import { listTeachingPlans, getTeachingPlanWithEntries } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';

/**
 * GET /api/timetable/plan-topics?classroom={id}[&classroom={id2}...]  (staff)
 *
 * Topics available in the Add Class dialog's searchable Topic picker, sourced from
 * the Course Plan Builder. Returns the topics placed in each selected classroom's
 * active teaching plan (union, deduped), grouped by Subject/module.
 *
 * Shape: { topics: [{ id, title, category }] } where `id` is a nexus_course_topics id
 * (written to nexus_scheduled_classes.course_topic_id), not a legacy nexus_topics id.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    // Accept ?classroom=a&classroom=b or ?classroom=a,b
    const raw = request.nextUrl.searchParams.getAll('classroom');
    const classroomIds = Array.from(
      new Set(raw.flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean)),
    );
    if (classroomIds.length === 0) {
      return NextResponse.json({ topics: [] });
    }

    // Resolve each classroom's active teaching plan (prefer 'active', else most recent
    // non-archived — listTeachingPlans already orders newest first).
    const planIds: string[] = [];
    for (const cid of classroomIds) {
      const plans = await listTeachingPlans(cid);
      const chosen = plans.find((p) => p.status === 'active') || plans[0];
      if (chosen) planIds.push(chosen.id);
    }
    if (planIds.length === 0) {
      return NextResponse.json({ topics: [] });
    }

    // Topics placed in those plans (skip test entries and entries without a topic).
    const seen = new Set<string>();
    const topics: { id: string; title: string; category: string }[] = [];
    for (const planId of planIds) {
      const detail = await getTeachingPlanWithEntries(planId);
      for (const entry of detail?.entries || []) {
        const t = entry.topic;
        if (!t || seen.has(t.id)) continue;
        seen.add(t.id);
        topics.push({ id: t.id, title: t.title, category: t.module?.title || 'General' });
      }
    }

    return NextResponse.json({ topics });
  } catch (err) {
    return errorResponse(err, 'Failed to load plan topics');
  }
}
