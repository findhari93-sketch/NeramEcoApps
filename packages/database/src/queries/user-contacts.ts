// @ts-nocheck - user_contacts is newer than the generated Database type
/**
 * Extra phones and emails a person is reachable on (user_contacts): a parent's
 * number folded in by a family merge, the number staff typed on an enrolment
 * link, the application form's parent phone, an older number of their own.
 *
 * Detection matches on them (so a parent's lead pairs with the student), and
 * User 360 lists them as Family contacts so staff call the right number once.
 * Fail-soft: before the migration the table is missing and nothing breaks.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import { normalisePhoneE164, phoneKey } from '../utils/phone';

export type ContactRelation = 'self' | 'parent' | 'guardian' | 'unknown';
export type ContactSource = 'merge' | 'enrolment_link' | 'lead_form' | 'staff' | 'otp';

export interface UserContact {
  id: string;
  user_id: string;
  kind: 'phone' | 'email';
  value: string;
  value_key: string;
  relation: ContactRelation;
  name: string | null;
  source: ContactSource;
  verified: boolean;
  merge_log_id: string | null;
  created_at: string;
}

/**
 * Remember a number for a person. Skipped when it is their own users.phone, and
 * idempotent per person and number. Returns whether a row was written.
 */
export async function addUserPhoneContact(
  userId: string,
  phone: string | null | undefined,
  options: { relation?: ContactRelation; source: ContactSource; name?: string | null },
  client?: TypedSupabaseClient,
): Promise<boolean> {
  const key = phoneKey(phone);
  if (!userId || !key) return false;
  const supabase = client || getSupabaseAdminClient();
  const { data: owner } = await supabase.from('users').select('phone').eq('id', userId).maybeSingle();
  if (owner && phoneKey(owner.phone) === key) return false;
  const { data, error } = await supabase
    .from('user_contacts')
    .upsert(
      {
        user_id: userId,
        kind: 'phone',
        value: normalisePhoneE164(phone) || String(phone).trim(),
        value_key: key,
        relation: options.relation ?? 'unknown',
        name: options.name?.trim() || null,
        source: options.source,
      },
      { onConflict: 'user_id,kind,value_key', ignoreDuplicates: true },
    )
    .select('id');
  if (error) {
    console.warn('[user-contacts] not saved:', error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** A person's extra numbers and emails, parents first. Empty when the table is missing. */
export async function listUserContacts(userId: string, client?: TypedSupabaseClient): Promise<UserContact[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('user_contacts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) return [];
  const rank: Record<string, number> = { parent: 0, guardian: 1, unknown: 2, self: 3 };
  return (data || []).sort((a, b) => (rank[a.relation] ?? 9) - (rank[b.relation] ?? 9));
}
