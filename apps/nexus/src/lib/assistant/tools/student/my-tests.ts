import { buildStudentTestsOverview } from '@/lib/student-tests-overview';
import type { ToolDef } from '@/lib/assistant/types';
import { EMPTY_SCHEMA, needsClassroom } from './shared';

export const myTests: ToolDef = {
  name: 'my_tests',
  description: 'Tests the student still has to take (open or opening soon), each with its window, and their recent scores.',
  parameters: EMPTY_SCHEMA,
  audience: 'student', kind: 'read', feature: 'tests',
  async run(ctx) {
    const gate = needsClassroom(ctx);
    if (gate) return gate;
    const o = await buildStudentTestsOverview(ctx.supabase, { studentId: ctx.caller.id, classroomId: ctx.classroomId, isStaff: false, now: ctx.now });
    const owed = (o.due || []).filter((t: any) => t.status === 'open' || t.status === 'upcoming').slice(0, 5);
    const scores = (o.recent || []).filter((r: any) => typeof r.percentage === 'number').slice(0, 3).map((r: any) => `${r.test_title} ${Math.round(r.percentage)}%`);
    const links = [{ label: 'Tests', url: '/student/tests' }];
    const scoreLine = scores.length ? `\nRecent ${scores.length === 1 ? 'score' : 'scores'}: ${scores.join(', ')}.` : '';
    if (owed.length === 0) return { ok: true, reply: `No tests are waiting for you right now.${scoreLine}`, data: { owed: [], scores }, links };
    const lines = owed.map((t: any, i: number) => `${i + 1}. ${t.title}: ${t.card?.reason || (t.status === 'upcoming' ? 'Opens soon.' : 'Open now.')}`);
    return {
      ok: true,
      reply: `You have ${owed.length} ${owed.length === 1 ? 'test' : 'tests'} to take:\n${lines.join('\n')}${scoreLine}`,
      data: { owed: owed.map((t: any) => ({ title: t.title, status: t.status, due_at: t.due_at ?? t.available_until ?? null, reason: t.card?.reason ?? null })), scores },
      links,
    };
  },
};
