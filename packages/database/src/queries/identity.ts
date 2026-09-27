// @ts-nocheck - user_identities is newer than the generated Database type
/**
 * Sign-in identities: every Firebase uid and Microsoft oid a person has used.
 *
 * users.firebase_uid / users.ms_oid hold ONE identity each. A person who signs in
 * with Google and separately with phone OTP has two Firebase uids; the old
 * resolver overwrote users.firebase_uid on every sign-in, so the column
 * flip-flopped between the two. user_identities records both, and
 * getUserByFirebaseUid / reconcileMsIdentity read it after the primary column.
 *
 * Fail-soft by design: if the table does not exist yet (code deployed before the
 * migration) or a write races, sign-in behaves exactly as it did before. An
 * identity lookup must never be the reason a student cannot sign in.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';

export type IdentityProvider = 'firebase' | 'microsoft';

export type RecordIdentityOutcome = 'inserted' | 'touched' | 'owned_by_other' | 'skipped';

/** True for "relation does not exist" from Postgres or PostgREST. */
export function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /relation .*user_identities.* does not exist|Could not find the table/i.test(error.message || '')
  );
}

/** Escape a value for an exact, case-insensitive PostgREST ILIKE. */
export function escapeIlikeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
}

/** The users.id that owns this identity, or null (also null if the table is missing). */
export async function findUserIdByIdentity(
  provider: IdentityProvider,
  providerUid: string,
  client?: TypedSupabaseClient,
): Promise<string | null> {
  if (!providerUid) return null;
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('user_identities')
    .select('user_id')
    .eq('provider', provider)
    .eq('provider_uid', providerUid)
    .maybeSingle();
  if (error) {
    if (!isMissingTableError(error)) console.warn('[identity] lookup failed:', error.message);
    return null;
  }
  return data?.user_id ?? null;
}

/**
 * Remember that `userId` signs in with this identity.
 *
 * Never moves an identity from one person to another: if the uid already
 * belongs to a different user, nothing changes and 'owned_by_other' is returned
 * (that pair is a duplicate for a human to review, not something to fix here).
 */
export async function recordIdentity(
  userId: string,
  provider: IdentityProvider,
  providerUid: string,
  details: { email?: string | null; phone?: string | null } = {},
  client?: TypedSupabaseClient,
): Promise<RecordIdentityOutcome> {
  if (!userId || !providerUid) return 'skipped';
  const supabase = client || getSupabaseAdminClient();
  const now = new Date().toISOString();

  const { data: existing, error: readError } = await supabase
    .from('user_identities')
    .select('id, user_id')
    .eq('provider', provider)
    .eq('provider_uid', providerUid)
    .maybeSingle();
  if (readError) {
    if (!isMissingTableError(readError)) console.warn('[identity] read failed:', readError.message);
    return 'skipped';
  }

  if (existing) {
    if (existing.user_id !== userId) return 'owned_by_other';
    await supabase.from('user_identities').update({ last_used_at: now }).eq('id', existing.id);
    return 'touched';
  }

  const { error } = await supabase.from('user_identities').insert({
    user_id: userId,
    provider,
    provider_uid: providerUid,
    email: details.email ?? null,
    phone: details.phone ?? null,
    last_used_at: now,
  });
  if (error) {
    // 23505: another request recorded it first. Anything else: sign-in goes on.
    if (error.code !== '23505' && !isMissingTableError(error)) {
      console.warn('[identity] insert failed:', error.message);
    }
    return error.code === '23505' ? 'touched' : 'skipped';
  }
  return 'inserted';
}

/** Every identity a user has, newest use first. Empty if the table is missing. */
export async function listUserIdentities(
  userId: string,
  client?: TypedSupabaseClient,
): Promise<Array<{ provider: IdentityProvider; provider_uid: string; email: string | null; phone: string | null; created_at: string; last_used_at: string | null }>> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('user_identities')
    .select('provider, provider_uid, email, phone, created_at, last_used_at')
    .eq('user_id', userId)
    .order('last_used_at', { ascending: false, nullsFirst: false });
  if (error) return [];
  return data || [];
}
