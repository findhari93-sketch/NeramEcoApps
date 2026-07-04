import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getTeachingPlanWithEntries,
  listLateJoiners,
  listTracksForPlan,
  getTrackWithItems,
  upsertTrack,
  replaceTrackItems,
  shareTrack,
  publishTopicsAsSelfLearning,
  logPlanAudit,
} from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { computeFlow, toFlowEntries, istToday } from '@/lib/plan-flow';
import { errorResponse } from '@/lib/api-errors';

/**
 * The topics a late joiner missed: plan topic entries whose last computed
 * class day fell before the student's enrolment date, in queue order.
 */
async function computeMissedTopics(planId: string, enrolledAt: string) {
  const plan = await getTeachingPlanWithEntries(planId);
  if (!plan) return null;
  const flow = computeFlow(toFlowEntries(plan.entries), {
    startDate: plan.start_date,
    saturdayClasses: plan.saturday_classes ?? true,
    today: istToday(),
  });
  const joinDate = enrolledAt.slice(0, 10);
  const missed = plan.entries
    .filter((e) => e.topic_id && e.entry_type !== 'test' && e.status !== 'skipped')
    .filter((e) => {
      const dates = flow.entryDates.get(e.id) || [];
      // Self-learning entries have no dates; include them when the plan has
      // moved past their queue neighbours is overkill for v1, skip those.
      return dates.length > 0 && dates[dates.length - 1] < joinDate;
    })
    .map((e) => ({ topic_id: e.topic_id as string, entry_id: e.id }));
  return { plan, flow, missed, joinDate };
}

/**
 * GET /api/teaching-plans/[id]/catchup  (staff)
 *   -> late joiners (with track summaries)
 * GET /api/teaching-plans/[id]/catchup?student_id=<id>
 *   -> that student's full track, generating it if missing
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const plan = await getTeachingPlanWithEntries(params.id);
    if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

    const studentId = request.nextUrl.searchParams.get('student_id');
    if (!studentId) {
      const [joiners, tracks] = await Promise.all([
        listLateJoiners(plan.classroom_id, plan.start_date),
        listTracksForPlan(params.id),
      ]);
      const trackByStudent = new Map(tracks.map((t) => [t.student_id, t]));
      return NextResponse.json({
        late_joiners: joiners.map((j) => ({
          ...j,
          track: trackByStudent.get(j.user_id) ?? null,
        })),
      });
    }

    // Single student: generate (or refresh an unshared) track, then return it.
    const supabase = getSupabaseAdminClient();
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('enrolled_at')
      .eq('classroom_id', plan.classroom_id)
      .eq('user_id', studentId)
      .eq('is_active', true)
      .maybeSingle();
    if (!enrollment) {
      return NextResponse.json({ error: 'Student is not enrolled in this classroom' }, { status: 404 });
    }

    const enrolledAt = enrollment.enrolled_at || `${plan.start_date}T00:00:00+05:30`;
    let track = await getTrackWithItems(params.id, studentId);
    if (!track || !track.shared_at) {
      const computed = await computeMissedTopics(params.id, enrolledAt);
      const row = await upsertTrack(params.id, studentId);
      await replaceTrackItems(row.id, computed?.missed ?? []);
      track = await getTrackWithItems(params.id, studentId);
    }
    return NextResponse.json({ track, enrolled_at: enrollment.enrolled_at });
  } catch (err) {
    return errorResponse(err, 'Failed to load catch-up');
  }
}

/**
 * POST /api/teaching-plans/[id]/catchup  (staff)
 * body { action: 'generate', student_id }   // (re)build the track from the plan
 * body { action: 'share', student_id }      // make it visible to the student
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);
    const body = await request.json();
    if (!body.student_id) {
      return NextResponse.json({ error: 'student_id is required' }, { status: 400 });
    }

    const plan = await getTeachingPlanWithEntries(params.id);
    if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

    const supabase = getSupabaseAdminClient();
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('enrolled_at')
      .eq('classroom_id', plan.classroom_id)
      .eq('user_id', body.student_id)
      .eq('is_active', true)
      .maybeSingle();
    if (!enrollment) {
      return NextResponse.json({ error: 'Student is not enrolled in this classroom' }, { status: 404 });
    }

    const enrolledAt = enrollment.enrolled_at || `${plan.start_date}T00:00:00+05:30`;
    switch (body.action) {
      case 'generate': {
        const computed = await computeMissedTopics(params.id, enrolledAt);
        const row = await upsertTrack(params.id, body.student_id);
        await replaceTrackItems(row.id, computed?.missed ?? []);
        const track = await getTrackWithItems(params.id, body.student_id);
        return NextResponse.json({ track });
      }

      case 'share': {
        let track = await getTrackWithItems(params.id, body.student_id);
        if (!track) {
          const computed = await computeMissedTopics(params.id, enrolledAt);
          const row = await upsertTrack(params.id, body.student_id);
          await replaceTrackItems(row.id, computed?.missed ?? []);
          track = await getTrackWithItems(params.id, body.student_id);
        }
        if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 });
        await shareTrack(track.id, user.id);

        // Publishing: the tracked topics become student-visible self-learning modules.
        await publishTopicsAsSelfLearning(track.items.map((i) => i.topic_id));

        const studentName = track.student?.name || 'the student';
        await logPlanAudit({
          plan_id: params.id,
          action: 'shared_catchup',
          performed_by: user.id,
          metadata: {
            summary: `shared the catch-up track with ${studentName} (${track.items.length} topics)`,
            student_id: body.student_id,
          },
        });
        const fresh = await getTrackWithItems(params.id, body.student_id);
        return NextResponse.json({ track: fresh });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    return errorResponse(err, 'Failed to save');
  }
}
