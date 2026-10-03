import { loadOwnAttendance } from '@/lib/student-attendance';
import type { ToolDef } from '@/lib/assistant/types';
import { EMPTY_SCHEMA, needsClassroom, studentScope } from './shared';

export const myAttendance: ToolDef = {
  name: 'my_attendance',
  description: "The student's own attendance, as the attendance page words it.",
  parameters: EMPTY_SCHEMA,
  audience: 'student',
  kind: 'read',
  feature: 'attendance',
  async run(ctx) {
    const gate = needsClassroom(ctx);
    if (gate) return gate;
    const own = await loadOwnAttendance(ctx.caller.id, await studentScope(ctx));
    return { ok: true, reply: own.sentence, data: own.summary, links: [{ label: 'Attendance', url: '/student/attendance' }] };
  },
};
