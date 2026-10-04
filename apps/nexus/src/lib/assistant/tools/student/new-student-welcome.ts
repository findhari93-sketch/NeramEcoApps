import { getCatchupJourney, getStudentPrimaryClassroom } from '@neram/database/queries/nexus';
import { formatDay, todayIst } from '@/lib/assistant/format';
import type { ToolDef } from '@/lib/assistant/types';
import { EMPTY_SCHEMA, needsClassroom, studentScope } from './shared';

export const newStudentWelcome: ToolDef = {
  name: 'new_student_welcome',
  description: 'A welcome for a student who has just joined: their classroom, join date, catch-up plan and where to start.',
  parameters: EMPTY_SCHEMA,
  audience: 'student', kind: 'read',
  async run(ctx) {
    const gate = needsClassroom(ctx);
    if (gate) return gate;
    const [scope, journey, classroom] = await Promise.all([
      studentScope(ctx),
      getCatchupJourney(ctx.caller.id, ctx.classroomId as string, ctx.supabase),
      getStudentPrimaryClassroom(ctx.caller.id, ctx.supabase),
    ]);
    const parts = [`Welcome to ${classroom?.name || 'your classroom'}.`];
    if (scope.enrolled_at) parts.push(`You joined on ${formatDay(todayIst(new Date(String(scope.enrolled_at))))}.`);
    parts.push(journey
      ? `Classes held before you joined are on your catch-up list: aim for ${journey.weekly_quota ?? 2} a week.`
      : 'Nothing is waiting on your catch-up list right now.');
    parts.push('Start with your timetable, then your assignments.');
    const links = [{ label: 'Timetable', url: '/student/timetable' }];
    if (journey) links.push({ label: 'Catch-up', url: '/student/catch-up' });
    links.push({ label: 'Assignments', url: '/student/assignments' });
    return { ok: true, reply: parts.join(' '), data: { classroom: classroom?.name ?? null, joined: scope.enrolled_at, catchup: journey ? { weekly_quota: journey.weekly_quota ?? 2 } : null }, links };
  },
};
