/**
 * Who is calling an /api/pad route, and is the Answer Pad switched on for them?
 *
 * Staff and students reach different surfaces behind different flags
 * (staff.answer-pad, student.answer-pad). While a flag is off the routes answer
 * 404, exactly as if they did not exist, so a dark launch reveals nothing.
 *
 * Only the surface is decided here. Which session and which classroom a caller
 * may touch is decided by the pad_* functions (session teacher, enrollment) and,
 * for an external teacher starting a session, by staff-scope.
 */

import { getNexusSetting } from '@neram/database';
import { ApiError } from '@/lib/api-errors';
import { FEATURE_FLAGS_KEY, isFeatureEnabled, resolveFlags, type FlagMap } from '@/lib/feature-flags';
import { getRequestUser, isInternalStaff, staffRoleOf, type RequestUser } from '@/lib/study-materials';
import { TtlCache } from '@/lib/ttl-cache';

export type PadRole = 'staff' | 'student';

export const PAD_FEATURE: Record<PadRole, string> = {
  staff: 'staff.answer-pad',
  student: 'student.answer-pad',
};

export interface PadCaller {
  user: RequestUser;
  role: PadRole;
  /** admin or manager: may run the pad for any classroom. */
  internal: boolean;
}

/**
 * Flags are read on every pad request, and a class of sixty sends a heartbeat
 * each every thirty seconds, so they are held briefly. A switch flipped in the
 * admin panel reaches the pad within this long.
 */
const FLAGS_TTL_MS = 15_000;
const flagCache = new TtlCache<FlagMap>(FLAGS_TTL_MS, 1);

/** Test seam. */
export function __clearPadFlagCache(): void {
  flagCache.clear();
}

async function loadFlags(): Promise<FlagMap> {
  const cached = flagCache.get(FEATURE_FLAGS_KEY);
  if (cached) return cached;
  const setting = await getNexusSetting(FEATURE_FLAGS_KEY);
  const flags = resolveFlags((setting?.value as FlagMap | undefined) || {});
  flagCache.set(FEATURE_FLAGS_KEY, flags);
  return flags;
}

export async function padFeatureEnabled(role: PadRole): Promise<boolean> {
  return isFeatureEnabled(PAD_FEATURE[role], await loadFlags());
}

/**
 * Authenticate first (a bad token is a 401 whatever the flags say), then gate
 * on the flag for the caller's surface.
 */
export async function resolvePadCaller(authHeader: string | null): Promise<PadCaller> {
  const user = await getRequestUser(authHeader);
  const role: PadRole = staffRoleOf(user) ? 'staff' : 'student';
  if (!(await padFeatureEnabled(role))) throw new ApiError('Not found', 404);
  return { user, role, internal: isInternalStaff(user) };
}

export function assertPadStaff(caller: PadCaller): void {
  if (caller.role !== 'staff') throw new ApiError('Only teachers can do this.', 403);
}

export function assertPadStudent(caller: PadCaller): void {
  if (caller.role !== 'student') throw new ApiError('Only students can do this.', 403);
}
