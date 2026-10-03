import type { ToolContext, ToolResult } from '@/lib/assistant/types';

export const NO_CLASSROOM: ToolResult = { ok: true, reply: 'You are not in a classroom yet, so there is nothing to show here. Your teacher will add you soon.' };

export const EMPTY_SCHEMA = { type: 'object' as const, properties: {} };

export function needsClassroom(ctx: ToolContext): ToolResult | null {
  return ctx.classroomId ? null : NO_CLASSROOM;
}

/** The student's batch and enrolment date, for loaders scoped that way. */
export async function studentScope(ctx: ToolContext): Promise<{ classroom_id: string; batch_id: string | null; enrolled_at: string | null }> {
  const { data } = await ctx.supabase
    .from('nexus_enrollments')
    .select('batch_id, enrolled_at')
    .eq('user_id', ctx.caller.id)
    .eq('classroom_id', ctx.classroomId)
    .maybeSingle();
  return { classroom_id: ctx.classroomId as string, batch_id: data?.batch_id ?? null, enrolled_at: data?.enrolled_at ?? null };
}
