import { listAssignmentsForStudent } from '@neram/database';
import { istDateOf } from '@/lib/assistant/brief-load';
import { relativeDay } from '@/lib/assistant/format';
import type { ToolDef } from '@/lib/assistant/types';
import { istNow } from '@/lib/upcoming-classes';
import { EMPTY_SCHEMA, needsClassroom } from './shared';

export const myAssignments: ToolDef = {
  name: 'my_assignments',
  description: 'Assignments the student still has to submit, nearest due date first.',
  parameters: EMPTY_SCHEMA,
  audience: 'student',
  kind: 'read',
  async run(ctx) {
    const gate = needsClassroom(ctx);
    if (gate) return gate;
    const { today } = istNow(ctx.now);
    const all = await listAssignmentsForStudent(ctx.caller.id, ctx.classroomId as string, ctx.supabase);
    const pending = all.filter((a) => !a.submission).sort((a, b) => String(a.due_at || '9999').localeCompare(String(b.due_at || '9999')));
    const links = [{ label: 'Assignments', url: '/student/assignments' }];
    if (pending.length === 0) return { ok: true, reply: 'Nothing to submit right now. All your assignments are in.', data: [], links };
    const lines = pending.slice(0, 5).map((a, i) => `${i + 1}. ${a.title}, ${a.due_at ? `due ${relativeDay(istDateOf(String(a.due_at)), today)}` : 'no due date'}.`);
    const head = `You have ${pending.length} ${pending.length === 1 ? 'assignment' : 'assignments'} to submit:`;
    return { ok: true, reply: `${head}\n${lines.join('\n')}`, data: pending, links };
  },
};
