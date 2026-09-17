import { NextRequest } from 'next/server';
import { ApiError } from '@/lib/api-errors';
import { assertPadStaff, resolvePadCaller } from '@/lib/pad/caller';
import { findScheduledClassForMeeting, meetingRefFromTeamsContext } from '@/lib/pad/meeting-binding';
import { announceForStart } from '@/lib/pad/notify-session';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { decideSessionBinding, mayRunSession, parseStartSessionRequest } from '@/lib/pad/session-binding';
import { batchBelongsToClassroom, classroomsForStaff, loadScheduledClass, padDb, teachesClassroom } from '@/lib/pad/sessions';

/**
 * POST /api/pad/sessions  (staff, behind staff.answer-pad)
 *
 * Start the Answer Pad for the class in front of the teacher, or resume the
 * session already live for it. Called when the console opens in the Teams
 * meeting side panel, with whatever TeamsJS reported about the meeting.
 *
 * Body: { meeting?: { meetingId?, chatId?, channelId? }, classroomId?, batchId?,
 *         scheduledClassId?, endExisting? }
 *
 * The class is found from the meeting (the scheduled class on the same chat
 * thread today, else the classroom this meeting series was bound to before),
 * or from what the teacher picked. When nothing identifies it, the answer is
 * { needsClassroom: true, classrooms } and the console asks once.
 *
 * Answers:
 *   200 { sessionId, resumed, endedSessionId, binding }
 *   200 { needsClassroom: true, classrooms: [{ id, name }] }
 *   409 SESSION_CONFLICT { existing }: another live session; the console offers
 *       "End <classroom> and start this class" and posts again with endExisting.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    assertPadStaff(caller);

    const parsed = parseStartSessionRequest(await request.json().catch(() => null));
    if (!parsed.ok) throw new PadRefusal('INVALID_INPUT', { field: parsed.field });
    const input = parsed.value;
    const supabase = padDb();

    const chosenClass = input.scheduledClassId ? await loadScheduledClass(input.scheduledClassId) : null;
    if (input.scheduledClassId && !chosenClass) throw new PadRefusal('NOT_FOUND', { field: 'scheduledClassId' });
    if (input.batchId && input.classroomId && !(await batchBelongsToClassroom(input.batchId, input.classroomId))) {
      throw new PadRefusal('INVALID_INPUT', { field: 'batchId' });
    }

    const ref = input.meeting ? meetingRefFromTeamsContext(input.meeting) : null;
    const scheduledMatch = !chosenClass && ref ? await findScheduledClassForMeeting(supabase, ref) : null;

    let remembered: { classroom_id: string; batch_id: string | null } | null = null;
    if (!chosenClass && !input.classroomId && !scheduledMatch && ref) {
      const recalled = await callPad<{ binding: { classroom_id: string; batch_id: string | null } | null }>(
        supabase,
        'pad_recall_meeting_binding',
        { p_actor: caller.user.id, p_thread: ref.threadId },
      );
      remembered = recalled.binding;
    }

    const binding = decideSessionBinding({
      chosenClass,
      chosenClassroomId: input.classroomId,
      chosenBatchId: input.batchId,
      scheduledMatch,
      remembered,
    });
    if (binding.kind === 'choose') {
      return padJson({ needsClassroom: true, classrooms: await classroomsForStaff(caller) });
    }

    const boundClass = [chosenClass, scheduledMatch].find((c) => c && c.id === binding.scheduledClassId) ?? null;
    const allowed = await mayRunSession({ internal: caller.internal, userId: caller.user.id }, binding, {
      scheduledClassTeacherId: boundClass?.teacher_id ?? null,
      teachesClassroom: () => teachesClassroom(caller.user.id, binding.classroomId),
    });
    if (!allowed) throw new ApiError('You can only run the Answer Pad for classes you teach.', 403);

    const started = await callPad<{ session_id: string; resumed: boolean; ended_session_id?: string | null }>(
      supabase,
      'pad_start_or_resume_session',
      {
        p_actor: caller.user.id,
        p_classroom: binding.classroomId,
        p_scheduled_class: binding.scheduledClassId,
        p_batch: binding.batchId,
        p_meeting_id: input.meeting?.meetingId ?? null,
        p_meeting_thread: ref?.threadId ?? null,
        p_end_existing: input.endExisting,
      },
    );

    // A new session tells the class chat once: the room code and the two ways in
    // that work on every Teams client. A resume stays quiet, so reopening the
    // panel never posts a second card.
    if (!started.resumed) await announceForStart(started.session_id, request.nextUrl.origin);

    return padJson({
      sessionId: started.session_id,
      resumed: started.resumed,
      endedSessionId: started.ended_session_id ?? null,
      binding: {
        source: binding.source,
        classroomId: binding.classroomId,
        batchId: binding.batchId,
        scheduledClassId: binding.scheduledClassId,
      },
    });
  } catch (err) {
    return padErrorResponse(err, 'start session');
  }
}
