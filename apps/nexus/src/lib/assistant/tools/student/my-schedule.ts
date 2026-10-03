import { formatTime12, relativeDay } from '@/lib/assistant/format';
import type { ToolDef } from '@/lib/assistant/types';
import { istNow, loadDeclinedClassIds, loadUpcomingClasses } from '@/lib/upcoming-classes';
import { EMPTY_SCHEMA, needsClassroom } from './shared';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const mySchedule: ToolDef = {
  name: 'my_schedule',
  description: "The student's next classes with date, time and whether they said they cannot attend.",
  parameters: EMPTY_SCHEMA,
  audience: 'student',
  kind: 'read',
  async run(ctx) {
    const gate = needsClassroom(ctx);
    if (gate) return gate;
    const { today, nowHHMM } = istNow(ctx.now);
    const classes = await loadUpcomingClasses(ctx.supabase, ctx.classroomId as string, { today, nowHHMM, limit: 5 });
    if (classes.length === 0) return { ok: true, reply: 'No classes are scheduled in the next few days.', data: [], links: [{ label: 'Timetable', url: '/student/timetable' }] };
    const declined = await loadDeclinedClassIds(ctx.supabase, ctx.caller.id, classes.map((c) => c.id));
    const lines = classes.map((c, i) => {
      const flag = declined.has(c.id) ? ' (you said you cannot attend)' : '';
      return `${i + 1}. ${cap(relativeDay(c.scheduled_date, today))}, ${formatTime12(c.start_time)} to ${formatTime12(c.end_time)}: ${c.title}${flag}.`;
    });
    return { ok: true, reply: `Your next classes:\n${lines.join('\n')}`, data: classes, links: [{ label: 'Timetable', url: '/student/timetable' }] };
  },
};
