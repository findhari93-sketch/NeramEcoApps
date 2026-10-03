import { ApiError } from '@/lib/api-errors';
import { FEATURE_FLAGS_KEY, isFeatureEnabled, resolveFlags } from '@/lib/feature-flags';

export const ASSISTANT_FLAG = 'student.assistant-chat';
/** nexus_settings key: a JSON array of users.id. Empty or missing means everyone with the flag on. */
export const PILOT_KEY = 'assistant_pilot_user_ids';

export interface AssistantGate {
  enabled: boolean;
  pilot: string[];
}

/**
 * One read for both switches. Fails CLOSED: a settings error reads as "off",
 * which is a 404 on a feature the founder has not opened yet, never a leak.
 */
export async function readAssistantGate(supabase: any): Promise<AssistantGate> {
  try {
    const { data, error } = await supabase
      .from('nexus_settings')
      .select('key, value')
      .in('key', [FEATURE_FLAGS_KEY, PILOT_KEY]);
    if (error) return { enabled: false, pilot: [] };
    const rows = (data || []) as Array<{ key: string; value: unknown }>;
    const flags = resolveFlags((rows.find((r) => r.key === FEATURE_FLAGS_KEY)?.value as Record<string, boolean>) || {});
    const rawPilot = rows.find((r) => r.key === PILOT_KEY)?.value;
    const pilot = Array.isArray(rawPilot) ? rawPilot.filter((v): v is string => typeof v === 'string') : [];
    return { enabled: isFeatureEnabled(ASSISTANT_FLAG, flags), pilot };
  } catch {
    return { enabled: false, pilot: [] };
  }
}

/**
 * The gate every /api/assistant route passes first.
 *
 * Off reads as 404 rather than 403 on purpose: while the feature is dark the
 * route should look like it does not exist, so nothing in a console hints at
 * what is coming. A student outside the pilot list, or a non-student, gets the
 * honest 403.
 */
export async function assertAssistantAccess(
  supabase: any,
  caller: { id: string; user_type: string | null },
): Promise<void> {
  const gate = await readAssistantGate(supabase);
  if (!gate.enabled) throw new ApiError('Not found', 404);
  if (caller.user_type !== 'student') throw new ApiError('Neram Assistant is for students in this release.', 403);
  if (gate.pilot.length > 0 && !gate.pilot.includes(caller.id)) {
    throw new ApiError('Neram Assistant is not switched on for your account yet.', 403);
  }
}
