import type { ActionToolDef } from '@/lib/assistant/types';
import { daysBetweenYmd, relativeDay, todayIst } from '@/lib/assistant/format';
import { MAX_WINDOW_DAYS, declareAwayWindow } from '@/lib/away-windows-write';
import { RSVP_REASONS, isRsvpReasonCode, reasonRequiresNote } from '@/lib/rsvp-reasons';
import { reasonLabel } from './decline-class';

export interface AwayArgs { starts_on: string; ends_on?: string | null; reason_code: string; note?: string | null }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const isYmd = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const declareAway: ActionToolDef<AwayArgs> = {
  name: 'declare_away_window',
  description: 'Mark the student away for a stretch of days, with a reason. Their classes in that period show as away.',
  parameters: {
    type: 'object',
    properties: {
      starts_on: { type: 'string', description: 'YYYY-MM-DD' },
      ends_on: { type: 'string', description: 'YYYY-MM-DD, inclusive; omit for open ended' },
      reason_code: { type: 'string', enum: RSVP_REASONS.map((r) => r.code) },
      note: { type: 'string' },
    },
    required: ['starts_on', 'reason_code'],
  },
  audience: 'student',
  kind: 'action',
  async run(ctx, args) {
    const today = todayIst(ctx.now);
    if (!isYmd(args.starts_on)) return { ok: false, error: 'I need a start date.' };
    const endsOn = isYmd(args.ends_on) ? args.ends_on : null;
    if (!isRsvpReasonCode(args.reason_code)) return { ok: false, error: 'Pick a reason.' };
    const note = typeof args.note === 'string' && args.note.trim() ? args.note.trim() : null;
    if (reasonRequiresNote(args.reason_code) && !note) return { ok: false, error: 'Add a short note so your teacher knows.' };
    if (args.starts_on < today) return { ok: false, error: 'Away dates can only start from today.' };
    if (endsOn && endsOn < args.starts_on) return { ok: false, error: 'The return date is before the start date.' };
    if (endsOn && daysBetweenYmd(args.starts_on, endsOn) > MAX_WINDOW_DAYS) return { ok: false, error: `Away dates cannot cover more than ${MAX_WINDOW_DAYS} days at once.` };
    const from = cap(relativeDay(args.starts_on, today));
    const to = endsOn ? cap(relativeDay(endsOn, today)) : 'until you tell me you are back';
    const fields = [
      { label: 'From', value: from },
      { label: 'To', value: endsOn ? to : 'Open ended' },
      { label: 'Reason', value: reasonLabel(args.reason_code) },
    ];
    if (note) fields.push({ label: 'Note', value: note });
    return {
      ok: true,
      data: {
        kind: 'declare_away_window',
        args: { starts_on: args.starts_on, ends_on: endsOn, reason_code: args.reason_code, note },
        summary: `Mark you away from ${from} ${endsOn ? `to ${to}` : to}. Reason: ${reasonLabel(args.reason_code)}.`,
        fields,
      },
    };
  },
  async execute(ctx, args) {
    const result = await declareAwayWindow(ctx.supabase, {
      userId: ctx.caller.id, startsOn: args.starts_on, endsOn: args.ends_on ?? null, reasonCode: args.reason_code, note: args.note ?? null,
    });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      reply: `Done. ${result.summary}. Your teachers know, and those classes will show as away on the register. The catch-up work still waits for you when you are back.`,
      links: [{ label: 'Timetable', url: '/student/timetable' }],
    };
  },
};
