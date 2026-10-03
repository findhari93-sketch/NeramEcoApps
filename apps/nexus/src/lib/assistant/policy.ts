import { resolveStaffRole } from '@/lib/staff-capabilities';
import type { AssistantCaller, AssistantFeatures, Audience, Mode, ToolDef } from './types';

/** Student unless the row resolves to a staff tier. Parents never reach here (access.ts). */
export function audienceOf(caller: AssistantCaller): Exclude<Audience, 'both'> {
  return resolveStaffRole({ staff_role: caller.staff_role, user_type: caller.user_type }) ? 'staff' : 'student';
}

/**
 * Which tools this person may use right now. Enforced here, not in a prompt.
 *
 * Filter order: (1) audience, (2) impersonation (actions forbidden), (3) a student feature the
 * app has switched off (Ruling 25: the assistant never opens a door the app has closed),
 * (4) mode (exam vs general).
 * Exam mode keeps ONLY exam tools. That rule is what makes the free Gemini key safe there in M2:
 * nothing about the student can be fetched on that path. Impersonation drops every action in
 * every mode: a teacher viewing as a student may look, never act in their name.
 */
export function allowedTools(tools: ToolDef[], caller: AssistantCaller, mode: Mode, features: AssistantFeatures): ToolDef[] {
  const audience = audienceOf(caller);
  return tools.filter((t) => {
    if (t.audience !== 'both' && t.audience !== audience) return false;
    if (caller.impersonating && t.kind === 'action') return false;
    if (t.feature && !features[t.feature]) return false;
    if (mode === 'exam') return t.mode === 'exam';
    return t.mode !== 'exam';
  });
}

const SELF_KEYS = ['student_id', 'user_id', 'studentId', 'userId'];

/** A student's arguments always point at themselves, whatever was typed or generated. */
export function bindStudentSelf<A extends Record<string, unknown>>(caller: AssistantCaller, args: A): A {
  if (audienceOf(caller) !== 'student') return args;
  const out: Record<string, unknown> = { ...args };
  for (const key of SELF_KEYS) if (key in out) out[key] = caller.id;
  return out as A;
}
