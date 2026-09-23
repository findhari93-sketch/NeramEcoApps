import { getSupabaseAdminClient } from '@neram/database';
import { ApiError } from '@/lib/api-errors';
import {
  FEATURE_FLAGS_KEY,
  allFeaturesEnabled,
  isFeatureEnabled,
  resolveFlags,
  type FlagMap,
} from '@/lib/feature-flags';
import { getRequestUser, isStaff, type RequestUser } from '@/lib/study-materials';

/**
 * Who is asking, and may they use Inspiration at all.
 *
 * The flag is checked here, server side, because Inspiration is peer-visible:
 * with the switch off, no drawing or name leaves the server, rather than a
 * hidden menu item over a route that still answers.
 */
export interface InspirationCaller {
  user: RequestUser;
  staff: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadFlags(authHeader: string | null): Promise<FlagMap> {
  // Test tokens are only honoured outside production (see ms-verify), and the
  // E2E client already runs with every feature on. Match it here.
  if (process.env.NODE_ENV !== 'production' && /^Bearer test_/.test(authHeader ?? '')) {
    return allFeaturesEnabled();
  }
  const { data } = await (getSupabaseAdminClient() as any)
    .from('nexus_settings')
    .select('value')
    .eq('key', FEATURE_FLAGS_KEY)
    .maybeSingle();
  return resolveFlags((data?.value as FlagMap) || {});
}

/**
 * Is the peer drawing library switched on for this caller?
 *
 * Exported for the doors into Inspiration that are not Inspiration routes:
 * "See how others drew this" sits inside a Question Bank drawing and
 * authorises through the Question Bank's own verifier, but it shows the same
 * students' work and must die by the same switch.
 */
export async function inspirationEnabledFor(
  authHeader: string | null,
  staff: boolean,
): Promise<boolean> {
  const flags = await loadFlags(authHeader);
  return isFeatureEnabled(staff ? 'staff.inspiration' : 'student.inspiration', flags);
}

export async function resolveInspirationCaller(authHeader: string | null): Promise<InspirationCaller> {
  const user = await getRequestUser(authHeader);
  const staff = isStaff(user);
  if (!(await inspirationEnabledFor(authHeader, staff))) {
    throw new ApiError('Inspiration is not available yet.', 404);
  }
  return { user, staff };
}

export function assertInspirationStaff(caller: InspirationCaller): void {
  if (!caller.staff) throw new ApiError('Only teachers can change Inspiration.', 403);
}

export function parseItemId(raw: string): string {
  if (!UUID.test(raw)) throw new ApiError('Drawing not found', 404);
  return raw;
}
