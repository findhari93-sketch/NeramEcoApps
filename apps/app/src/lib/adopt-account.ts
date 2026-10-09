import type { getSupabaseAdminClient } from '@neram/database';

/**
 * Rules for "Sign in with this number" (api/auth/adopt-account): which earlier
 * account is a shell made by this very sign-in, safe to merge automatically.
 */

/** How old the earlier account may be and still count as made by this sign-in. */
const DISPOSABLE_WINDOW_MS = 24 * 60 * 60 * 1000;

type AdminClient = ReturnType<typeof getSupabaseAdminClient>;

async function countRows(client: AdminClient, table: 'lead_profiles' | 'payments', userId: string): Promise<number> {
  const { count, error } = await (client.from(table) as any).select('id', { count: 'exact', head: true }).eq('user_id', userId);
  if (error) throw error;
  return count ?? 0;
}

/** A shell account: a lead, created in the last day, with no application and no payment. */
export async function isDisposableAccount(
  client: AdminClient,
  user: { id: string; user_type?: string | null; created_at?: string | null },
  now = Date.now(),
): Promise<boolean> {
  if (user.user_type && user.user_type !== 'lead') return false;
  const created = user.created_at ? new Date(user.created_at).getTime() : 0;
  if (!created || now - created > DISPOSABLE_WINDOW_MS) return false;
  const [applications, payments] = await Promise.all([
    countRows(client, 'lead_profiles', user.id),
    countRows(client, 'payments', user.id),
  ]);
  return applications === 0 && payments === 0;
}
