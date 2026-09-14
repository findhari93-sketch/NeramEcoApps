import { NextRequest, NextResponse } from 'next/server';
import { loadClassroomRoster } from '@neram/database/queries/nexus';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { realGraphToken, staffClassroomIds } from '@/lib/sketchbook-access';
import { istDate } from '@/lib/sketchbook-rhythm';
import { clampDates, quietClock, trackingStart } from '@/lib/sketchbook-status';
import { loadClassroomSketchbookSettings, loadDrawingDays, loadReactivations } from '@/lib/drawing-activity-store';
import { recordTeacherReminder } from '@/lib/sketchbook-reminder-store';
import { escapeHtml, sendNudge } from '@/lib/nudge-delivery';
import { shareBaseUrl } from '@/lib/class-share-links';

const MAX_STUDENTS = 60;

/**
 * POST /api/sketchbook/nudge   (staff)
 * body { classroom_id, student_ids: string[] }
 *
 * A teacher selects quiet students on Class rhythm and presses Nudge. The message
 * goes as THEIR Teams chat (so the student can reply to a person), plus the
 * Nexus bell, through sendNudge. Each student's own quiet days are filled in.
 *
 * The id list only narrows: anyone not a tracked student of this classroom is
 * dropped. Logged as a teacher reminder, which blocks that evening's automatic
 * one (nobody gets two) but never counts toward "Needs a call".
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    const token = realGraphToken(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}));
    const classroomId = typeof body?.classroom_id === 'string' ? body.classroom_id : '';
    const requested: string[] = Array.isArray(body?.student_ids) ? body.student_ids.filter((x: unknown) => typeof x === 'string') : [];
    if (!classroomId || requested.length === 0) throw new ApiError('Pick at least one student.', 400);
    if (requested.length > MAX_STUDENTS) throw new ApiError(`Nudge at most ${MAX_STUDENTS} students at once.`, 400);

    const mine = await staffClassroomIds(caller);
    if (!mine.includes(classroomId)) throw new ApiError('You do not teach this classroom.', 403);

    const today = istDate(new Date());
    const [roster, settings] = await Promise.all([loadClassroomRoster(classroomId), loadClassroomSketchbookSettings(classroomId)]);
    const wanted = new Set(requested);
    const members = roster.members.filter((m) => wanted.has(m.user_id));
    if (members.length === 0) throw new ApiError('None of those students are in this class.', 400);
    const ids = members.map((m) => m.user_id);

    const reactivations = await loadReactivations(classroomId, ids);
    const starts = Object.fromEntries(
      members.map((m) => [
        m.user_id,
        trackingStart({ classroomStartedOn: settings.startedOn, enrolledAt: m.enrolled_at, reactivatedOn: reactivations[m.user_id] }),
      ]),
    );
    const since = Object.values(starts).reduce((a, b) => (b < a ? b : a));
    const days = await loadDrawingDays(ids, since);

    const clock: Record<string, { cycleStart: string; quietDays: number }> = {};
    const personalise: Record<string, Record<string, string>> = {};
    for (const id of ids) {
      const dates = clampDates(days[id] || [], starts[id], today);
      const { since: cycleStart, quietDays } = quietClock(starts[id], dates.length ? dates[dates.length - 1] : null, today);
      clock[id] = { cycleStart, quietDays };
      personalise[id] = { days: String(quietDays), dayWord: quietDays === 1 ? 'day' : 'days' };
    }

    const url = `${shareBaseUrl(request.nextUrl.origin)}/student/sketchbook?add=1`;
    const plain = 'Hi {firstName}, I have not seen a drawing from you in {days} {dayWord}. Add one small sketch today, even a rough one.';
    const { results, counts } = await sendNudge({
      studentIds: ids,
      // Narrowed to the tracked roster above, and a teacher picked them by hand.
      respectDormancy: false,
      subject: 'A sketch today, {firstName}?',
      plain,
      chat: {
        delegatedToken: token,
        html: `<p>${escapeHtml(plain)}</p><p><a href="${escapeHtml(url)}">Add a sketch</a></p>`,
      },
      personalise,
      eventType: 'sketch_rhythm_nudge',
      metadata: { source: 'sketchbook_teacher_nudge', classroom_id: classroomId, sent_by: caller.id },
      source: { kind: 'sketchbook_teacher_nudge', refId: classroomId },
    });

    await Promise.all(
      results.map((r) =>
        recordTeacherReminder({
          studentId: r.studentId,
          classroomId,
          sentBy: caller.id,
          cycleStart: clock[r.studentId]?.cycleStart ?? today,
          quietDays: clock[r.studentId]?.quietDays ?? 0,
          sentOn: today,
          channel: r.channel,
          reasons: r.reasons ?? null,
        }).catch((e) => console.error('[sketchbook/nudge] could not log reminder:', e)),
      ),
    );

    return NextResponse.json(
      {
        counts,
        results: results.map((r) => ({ studentId: r.studentId, name: r.name, channel: r.channel, reasons: r.reasons ?? null })),
        dropped: requested.length - ids.length,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return errorResponse(err, 'Could not send the nudge');
  }
}
