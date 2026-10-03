import { getCatchupBacklog } from '@neram/database';
import { formatDay } from '@/lib/assistant/format';
import { computeCatchupPace, describeCatchupPace } from '@/lib/catchup-pace';
import type { ToolDef } from '@/lib/assistant/types';
import { istNow } from '@/lib/upcoming-classes';
import { EMPTY_SCHEMA, needsClassroom } from './shared';

export const myCatchup: ToolDef = {
  name: 'my_catchup',
  description: 'Missed classes the student still has to catch up on, and how they stand against their weekly pace.',
  parameters: EMPTY_SCHEMA,
  audience: 'student',
  kind: 'read',
  async run(ctx) {
    const gate = needsClassroom(ctx);
    if (gate) return gate;
    const { today } = istNow(ctx.now);
    const links = [{ label: 'Catch-up', url: '/student/catch-up' }];
    const backlog = await getCatchupBacklog(ctx.caller.id, ctx.classroomId as string, ctx.supabase);
    const open = (backlog?.items || []).filter((i) => !i.caught_up_at && !i.excused);
    if (!backlog || open.length === 0) return { ok: true, reply: 'You have nothing to catch up on.', data: [], links };
    const named = open.slice(0, 3).map((i) => `${i.class.title || 'a class'} (${formatDay(i.class.scheduled_date)})`).join(', ');
    const more = open.length > 3 ? ` and ${open.length - 3} more` : '';
    let pace = '';
    if (backlog.journey) {
      const quota = backlog.journey.weekly_quota ?? 2;
      pace = ' ' + describeCatchupPace(
        computeCatchupPace({ started_on: backlog.journey.started_on, weekly_quota: quota, total_items: backlog.totals?.total ?? open.length, completed_items: backlog.totals?.completed ?? 0 }, today),
        quota,
      );
    }
    return { ok: true, reply: `${open.length} ${open.length === 1 ? 'class' : 'classes'} to catch up on: ${named}${more}.${pace}`, data: open, links };
  },
};
