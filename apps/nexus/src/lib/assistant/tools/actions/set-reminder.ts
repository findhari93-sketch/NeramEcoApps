import type { ActionToolDef } from '@/lib/assistant/types';
import { daysBetweenYmd, relativeDay, todayIst } from '@/lib/assistant/format';
import { createReminder } from '@/lib/assistant/store';

export interface ReminderArgs { due_on: string; text: string }

export const MAX_REMINDER_DAYS = 120;

export const setReminder: ActionToolDef<ReminderArgs> = {
  name: 'set_reminder',
  description: 'Remind the student about something on a given day. Shown on their brief card that day; M1 sends no message.',
  parameters: {
    type: 'object',
    properties: { due_on: { type: 'string', description: 'YYYY-MM-DD' }, text: { type: 'string' } },
    required: ['due_on', 'text'],
  },
  audience: 'student',
  kind: 'action',
  async run(ctx, args) {
    const today = todayIst(ctx.now);
    const text = typeof args.text === 'string' ? args.text.trim().slice(0, 200) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(args.due_on))) return { ok: false, error: 'Which day should I remind you?' };
    if (!text) return { ok: false, error: 'What should I remind you about?' };
    if (args.due_on < today) return { ok: false, error: 'That day has already passed. Which day should I remind you?' };
    if (daysBetweenYmd(today, args.due_on) > MAX_REMINDER_DAYS) return { ok: false, error: 'I can only set reminders up to four months ahead.' };
    const when = relativeDay(args.due_on, today);
    return {
      ok: true,
      data: { kind: 'set_reminder', args: { due_on: args.due_on, text }, summary: `Remind you ${when}: ${text}.`, fields: [{ label: 'When', value: when }, { label: 'About', value: text }] },
    };
  },
  async execute(ctx, args) {
    await createReminder(ctx.supabase, { userId: ctx.caller.id, threadId: ctx.threadId, dueOn: args.due_on, text: args.text, kind: 'free' });
    const when = relativeDay(args.due_on, todayIst(ctx.now));
    // M1 sends nothing (Ruling 24): the brief card on the day is the whole promise.
    return { ok: true, reply: `Done. I will put this on your brief card ${when}: ${args.text}.`, links: [] };
  },
};
