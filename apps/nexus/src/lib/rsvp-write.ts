/**
 * Writing a class RSVP, on the default-attending model (see the route's header
 * comment): only opt-outs are stored, opting back in deletes the row.
 *
 * Extracted from POST /api/timetable/rsvp so the assistant's cannot-attend
 * flow and the RSVP sheet share one set of rules and one teacher notification.
 */
import { notifyRsvpToTeacher } from '@/lib/timetable-notifications';
import { isRsvpReasonCode, reasonRequiresNote } from '@/lib/rsvp-reasons';
import { isMissingTable } from '@/lib/away-windows';

export interface RsvpWriteInput {
  userId: string;
  classId: string;
  /** Optional cross-check; the class row is the source of truth. */
  classroomId?: string | null;
  response: 'attending' | 'not_attending';
  reasonCode?: unknown;
  note?: string | null;
  wantsCatchup?: boolean;
  /**
   * Who said "coming". Undefined or null is the student themselves; a staff id
   * means the office was told on the phone (api/timetable/[classId]/confirmations).
   */
  confirmedBy?: string | null;
}

export type RsvpWriteResult =
  | { ok: true; attending: boolean; rsvp: Record<string, unknown> | null; classTitle: string | null; classroomId: string }
  | { ok: false; status: number; error: string };

type NotifyFn = typeof notifyRsvpToTeacher;

export async function writeRsvp(
  supabase: any,
  input: RsvpWriteInput,
  deps: { notify: NotifyFn } = { notify: notifyRsvpToTeacher },
): Promise<RsvpWriteResult> {
  if (input.response !== 'attending' && input.response !== 'not_attending') {
    return { ok: false, status: 400, error: 'Invalid response value' };
  }
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (input.response === 'not_attending') {
    if (!isRsvpReasonCode(input.reasonCode)) {
      return { ok: false, status: 400, error: 'Pick a reason so your teacher knows why you cannot make it' };
    }
    if (reasonRequiresNote(input.reasonCode) && !note) {
      return { ok: false, status: 400, error: 'Tell us a little more so your teacher knows what came up' };
    }
  }

  const { data: cls } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, title, classroom_id')
    .eq('id', input.classId)
    .maybeSingle();
  if (!cls || (input.classroomId && cls.classroom_id !== input.classroomId)) {
    return { ok: false, status: 404, error: 'Class not found in this classroom' };
  }
  const classroomId = cls.classroom_id as string;

  const { data: enrollment } = await supabase
    .from('nexus_enrollments')
    .select('role')
    .eq('user_id', input.userId)
    .eq('classroom_id', classroomId)
    .eq('is_active', true)
    .maybeSingle();
  if (!enrollment) return { ok: false, status: 403, error: 'Not enrolled' };

  if (input.response === 'attending') {
    const { error } = await supabase
      .from('nexus_class_rsvp')
      .delete()
      .eq('scheduled_class_id', input.classId)
      .eq('student_id', input.userId);
    if (error) throw error;
    await recordConfirmation(supabase, {
      classId: input.classId,
      studentId: input.userId,
      classroomId,
      confirmedBy: input.confirmedBy ?? null,
    });
    return { ok: true, attending: true, rsvp: null, classTitle: cls.title ?? null, classroomId };
  }

  const { data, error } = await supabase
    .from('nexus_class_rsvp')
    .upsert(
      {
        scheduled_class_id: input.classId,
        student_id: input.userId,
        response: 'not_attending',
        reason_code: input.reasonCode,
        reason: note || null,
        wants_catchup: input.wantsCatchup !== false,
        responded_at: new Date().toISOString(),
      },
      { onConflict: 'scheduled_class_id,student_id' },
    )
    .select('*')
    .single();
  if (error) throw error;

  // Tell the teachers. Never let a notification failure lose the RSVP.
  try {
    const { data: userData } = await supabase.from('users').select('name').eq('id', input.userId).single();
    await deps.notify(classroomId, userData?.name || 'A student', 'not_attending', note || null, cls.title, input.classId);
  } catch {
    /* notification is best-effort */
  }

  return { ok: true, attending: false, rsvp: data, classTitle: cls.title ?? null, classroomId };
}

/**
 * "I'll be there", stored as an answer.
 *
 * On the default-attending model a yes used to leave no trace, so a student who
 * was asked and said yes looked the same as one who ignored the message. The
 * office's call list (lib/attendance-confirm.ts) needs them apart.
 *
 * Best-effort on a missing table, like every reader of it: the app can go live
 * before the migration lands, and a lost yes is better than a lost RSVP.
 */
async function recordConfirmation(
  supabase: any,
  input: { classId: string; studentId: string; classroomId: string; confirmedBy: string | null },
): Promise<void> {
  const { error } = await supabase.from('nexus_attendance_confirmations').upsert(
    {
      scheduled_class_id: input.classId,
      student_id: input.studentId,
      classroom_id: input.classroomId,
      confirmed_at: new Date().toISOString(),
      confirmed_by: input.confirmedBy,
    },
    { onConflict: 'scheduled_class_id,student_id' },
  );
  if (error && !isMissingTable(error)) throw error;
}
