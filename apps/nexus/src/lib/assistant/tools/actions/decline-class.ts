import type { ActionToolDef } from '@/lib/assistant/types';
import { formatTime12, relativeDay, todayIst } from '@/lib/assistant/format';
import { RSVP_REASONS, isRsvpReasonCode, reasonRequiresNote } from '@/lib/rsvp-reasons';
import { writeRsvp } from '@/lib/rsvp-write';

export interface DeclineClassArgs { class_id: string; reason_code: string; note?: string | null; expect_date?: string | null; expect_start?: string | null }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const reasonLabel = (code: string) => RSVP_REASONS.find((r) => r.code === code)?.label || code;

export const declineClass: ActionToolDef<DeclineClassArgs> = {
  name: 'decline_class',
  description: 'Tell the teacher the student cannot attend one scheduled class, with a reason.',
  parameters: {
    type: 'object',
    properties: {
      class_id: { type: 'string' },
      reason_code: { type: 'string', enum: RSVP_REASONS.map((r) => r.code) },
      note: { type: 'string' },
    },
    required: ['class_id', 'reason_code'],
  },
  audience: 'student',
  kind: 'action',
  async run(ctx, args) {
    if (!isRsvpReasonCode(args.reason_code)) return { ok: false, error: 'Pick a reason so your teacher knows why you cannot make it.' };
    const note = typeof args.note === 'string' && args.note.trim() ? args.note.trim() : null;
    if (reasonRequiresNote(args.reason_code) && !note) return { ok: false, error: 'Tell us a little more so your teacher knows what came up.' };
    const { data: cls } = await ctx.supabase
      .from('nexus_scheduled_classes')
      .select('id, title, scheduled_date, start_time, end_time, classroom_id, status')
      .eq('id', args.class_id)
      .maybeSingle();
    // Another classroom's class reads exactly like a missing one: its title is not ours to show.
    if (!cls || (ctx.classroomId && cls.classroom_id !== ctx.classroomId)) return { ok: false, error: 'I could not find that class.' };
    if (cls.status === 'cancelled') return { ok: false, error: `${cls.title} was cancelled, so there is nothing to decline.` };
    const when = `${cap(relativeDay(cls.scheduled_date, todayIst(ctx.now)))}, ${formatTime12(cls.start_time)}`;
    // On the confirm re-run the args carry what the card showed. A class moved
    // since then is refused, so the teacher is never told about the wrong day.
    if (args.expect_date && (args.expect_date !== cls.scheduled_date || (args.expect_start ?? null) !== cls.start_time)) {
      return { ok: false, error: `${cls.title} has moved to ${when}. Ask me again if you still cannot attend.` };
    }
    return {
      ok: true,
      data: {
        kind: 'decline_class',
        args: { class_id: cls.id, reason_code: args.reason_code, note, expect_date: cls.scheduled_date, expect_start: cls.start_time },
        summary: `Tell your teacher you cannot attend ${cls.title} on ${cap(relativeDay(cls.scheduled_date, todayIst(ctx.now)))} at ${formatTime12(cls.start_time)}.`,
        fields: [
          { label: 'Class', value: cls.title },
          { label: 'When', value: when },
          { label: 'Reason', value: note && args.reason_code === 'other' ? note : reasonLabel(args.reason_code) },
        ],
      },
    };
  },
  async execute(ctx, args) {
    const result = await writeRsvp(ctx.supabase, {
      userId: ctx.caller.id, classId: args.class_id, response: 'not_attending', reasonCode: args.reason_code, note: args.note ?? null, wantsCatchup: true,
    });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      reply: `Done. Your teacher knows you cannot attend ${result.classTitle || 'the class'}. The catch-up for it will appear on your list after the class.`,
      links: [{ label: 'Timetable', url: '/student/timetable' }],
    };
  },
};
