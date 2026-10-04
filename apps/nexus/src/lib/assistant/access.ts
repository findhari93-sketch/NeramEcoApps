import { ApiError } from '@/lib/api-errors';
import { FEATURE_FLAGS_KEY, isFeatureEnabled, resolveFlags, type FlagMap } from '@/lib/feature-flags';

import { ASSISTANT_FLAG, ATTENDANCE_FLAG, INSPIRATION_FLAG, PILOT_KEY, QUESTION_BANK_FLAG, SKETCHBOOK_FLAG, TESTS_FLAG } from './flag';
import type { AssistantFeatures } from './types';

export { ASSISTANT_FLAG, ATTENDANCE_FLAG, INSPIRATION_FLAG, PILOT_KEY, QUESTION_BANK_FLAG, SKETCHBOOK_FLAG, TESTS_FLAG } from './flag';

export interface AssistantGate {
  enabled: boolean;
  pilot: string[];
  /** The student features the assistant opens doors to (Ruling 25). */
  features: AssistantFeatures;
}

const CLOSED: AssistantGate = { enabled: false, pilot: [], features: { sketchbook: false, attendance: false, tests: false, questionBank: false, inspiration: false } };

/** The pilot allowlist from a raw nexus_settings value: string ids only, anything else reads as empty. */
export function parsePilot(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
}

/** The assistant-facing student features in a resolved flag map. */
export function featuresOf(flags: FlagMap): AssistantFeatures {
  return {
    sketchbook: isFeatureEnabled(SKETCHBOOK_FLAG, flags),
    attendance: isFeatureEnabled(ATTENDANCE_FLAG, flags),
    tests: isFeatureEnabled(TESTS_FLAG, flags),
    questionBank: isFeatureEnabled(QUESTION_BANK_FLAG, flags),
    inspiration: isFeatureEnabled(INSPIRATION_FLAG, flags),
  };
}

/**
 * One read for both switches and the features the assistant depends on. Fails
 * CLOSED: a settings error reads as "off", which is a 404 on a feature the
 * founder has not opened yet, never a leak.
 */
export async function readAssistantGate(supabase: any): Promise<AssistantGate> {
  try {
    const { data, error } = await supabase
      .from('nexus_settings')
      .select('key, value')
      .in('key', [FEATURE_FLAGS_KEY, PILOT_KEY]);
    if (error) return CLOSED;
    const rows = (data || []) as Array<{ key: string; value: unknown }>;
    const flags = resolveFlags((rows.find((r) => r.key === FEATURE_FLAGS_KEY)?.value as Record<string, boolean>) || {});
    const pilot = parsePilot(rows.find((r) => r.key === PILOT_KEY)?.value);
    return { enabled: isFeatureEnabled(ASSISTANT_FLAG, flags), pilot, features: featuresOf(flags) };
  } catch {
    return CLOSED;
  }
}

/**
 * The per-user feature-flag payload (/api/auth/me) with the pilot allowlist
 * folded in (Ruling 22), so the client hides the assistant from exactly the
 * students the server gate would refuse. An empty or missing list means
 * everyone with the flag on. A failed read of the list fails closed, as the
 * server gate does. Never turns the flag on.
 */
export function withAssistantPilot(flags: FlagMap, userId: string, rawPilot: unknown, opts: { readFailed?: boolean } = {}): FlagMap {
  if (flags[ASSISTANT_FLAG] !== true) return flags;
  const pilot = parsePilot(rawPilot);
  const allowed = !opts.readFailed && (pilot.length === 0 || pilot.includes(userId));
  return allowed ? flags : { ...flags, [ASSISTANT_FLAG]: false };
}

/**
 * The gate every /api/assistant route passes first. Returns the features the
 * assistant may open for this caller.
 *
 * Off reads as 404 rather than 403 on purpose: while the feature is dark the
 * route should look like it does not exist, so nothing in a console hints at
 * what is coming. A student outside the pilot list, or a non-student, gets the
 * honest 403.
 */
export async function assertAssistantAccess(
  supabase: any,
  caller: { id: string; user_type: string | null },
): Promise<AssistantFeatures> {
  const gate = await readAssistantGate(supabase);
  if (!gate.enabled) throw new ApiError('Not found', 404);
  if (caller.user_type !== 'student') throw new ApiError('Neram Assistant is for students in this release.', 403);
  if (gate.pilot.length > 0 && !gate.pilot.includes(caller.id)) {
    throw new ApiError('Neram Assistant is not switched on for your account yet.', 403);
  }
  return gate.features;
}
