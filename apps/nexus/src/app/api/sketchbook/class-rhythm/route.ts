import { NextRequest, NextResponse } from 'next/server';
import { getSketchbookGoalHistory, isTracked, loadClassroomRoster } from '@neram/database/queries/nexus';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { staffClassroomIds } from '@/lib/sketchbook-access';
import { computeRhythm, istDate } from '@/lib/sketchbook-rhythm';
import { clampDates, quietClock, rhythmStatus, trackingStart } from '@/lib/sketchbook-status';
import {
  loadClassroomSketchbookSettings, loadDrawingDays, loadLatestSketches, loadReactivations,
} from '@/lib/drawing-activity-store';
import { loadRemindersThisCycle } from '@/lib/sketchbook-reminder-store';

/**
 * GET /api/sketchbook/class-rhythm?classroom=<id>   (staff)
 *
 * Every tracked student in the classroom with where they stand this week.
 *
 * Dormant students are loaded only to be counted: their rows never leave the
 * server, so no list or number on the screen includes them, and `pausedCount`
 * lets the screen say how many are hidden. Each student is judged only from
 * their own tracking start (sketchbook-status.ts), and any drawing upload
 * counts as a practice day.
 */
export async function GET(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom');
    if (!classroomId) throw new ApiError('Missing classroom', 400);
    const mine = await staffClassroomIds(caller);
    if (!mine.includes(classroomId)) throw new ApiError('You do not teach this classroom.', 403);

    const today = istDate(new Date());
    const [roster, history, settings] = await Promise.all([
      // includeDormant only so they can be counted; see the doc comment.
      loadClassroomRoster(classroomId, { includeDormant: true }),
      getSketchbookGoalHistory(classroomId),
      loadClassroomSketchbookSettings(classroomId),
    ]);
    const tracked = roster.members.filter(isTracked);
    const pausedCount = new Set(
      roster.members.filter((m) => m.participation_status === 'dormant').map((m) => m.user_id),
    ).size;
    const ids = tracked.map((m) => m.user_id);

    const reactivations = await loadReactivations(classroomId, ids);
    const starts: Record<string, string> = {};
    for (const m of tracked) {
      starts[m.user_id] = trackingStart({
        classroomStartedOn: settings.startedOn,
        enrolledAt: m.enrolled_at,
        reactivatedOn: reactivations[m.user_id],
      });
    }
    const since = ids.length ? Object.values(starts).reduce((a, b) => (b < a ? b : a)) : settings.startedOn;

    const [days, latest, reminders] = await Promise.all([
      loadDrawingDays(ids, since),
      loadLatestSketches(ids),
      loadRemindersThisCycle(ids),
    ]);

    const students = tracked.map((m) => {
      const start = starts[m.user_id];
      const dates = clampDates(days[m.user_id] || [], start, today);
      const rhythm = computeRhythm(dates, today, history, settings.goal);
      // Reminders only count toward "Needs a call" in the CURRENT quiet stretch;
      // a drawing since then started a new one.
      const { since: cycleStart } = quietClock(start, dates.length ? dates[dates.length - 1] : null, today);
      const log = reminders[m.user_id];
      const autoSteps = log && log.cycleStart === cycleStart ? log.autoSteps : 0;
      const s = rhythmStatus({
        dates,
        today,
        start,
        goal: rhythm.week.goal,
        enrolledOn: m.enrolled_at ? istDate(m.enrolled_at) : null,
        run: rhythm.run,
        autoRemindersThisCycle: autoSteps,
      });
      return {
        userId: m.user_id,
        name: m.user.name,
        email: m.user.email,
        avatarUrl: m.user.avatar_url,
        msOid: m.user.ms_oid,
        enrolledAt: m.enrolled_at,
        start,
        status: s.status,
        label: s.label,
        quietDays: s.quietDays,
        lastDrawingDate: s.lastDrawingDate,
        week: s.week,
        strip: s.strip,
        run: rhythm.run,
        remindersThisCycle: autoSteps,
        lastRemindedOn: log?.lastSentOn ?? null,
        latestSketch: latest[m.user_id] ?? null,
      };
    });

    return NextResponse.json(
      { goal: settings.goal, startedOn: settings.startedOn, today, pausedCount, students },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return errorResponse(err, 'Could not load the class rhythm');
  }
}
