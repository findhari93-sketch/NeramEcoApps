import { describeExamCountdown } from '@/lib/exam-countdown';
import { resolveExamCountdown } from '@/lib/exam-countdown-server';
import type { ToolDef } from '@/lib/assistant/types';
import { istNow } from '@/lib/upcoming-classes';
import { EMPTY_SCHEMA, needsClassroom } from './shared';

export const examCountdown: ToolDef = {
  name: 'exam_countdown',
  description: 'Days left until the exam the class is preparing for.',
  parameters: EMPTY_SCHEMA,
  audience: 'student',
  kind: 'read',
  async run(ctx) {
    const gate = needsClassroom(ctx);
    if (gate) return gate;
    const { today } = istNow(ctx.now);
    const target = await resolveExamCountdown(ctx.supabase, { classroomId: ctx.classroomId as string, studentId: ctx.caller.id });
    const view = target ? describeExamCountdown(target, today) : null;
    if (!view || !view.visible) return { ok: true, reply: 'No exam date is set for your class yet. Your teacher will add it.', data: null };
    return { ok: true, reply: `${view.short_label}: ${view.headline.replace(/\.?$/, '.')} ${view.detail.replace(/\.?$/, '.')}`.trim(), data: view };
  },
};
