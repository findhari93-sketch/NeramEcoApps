// @ts-nocheck - Supabase types not generated
/**
 * Microsoft identity reconciliation.
 *
 * PROBLEM this solves: a student first signs up via Google/Firebase on the Tools
 * app (a `users` row with firebase_uid + a personal gmail, ms_oid NULL). Later an
 * admin creates their `@neramclasses.com` Entra mailbox by hand. The old code
 * matched an incoming Microsoft account ONLY by ms_oid, so it never found that
 * pre-existing Google row and INSERTed a second, duplicate row (an empty
 * `@neramclasses.com` shell). See the duplicate-account cleanup, 2026-07-07.
 *
 * `reconcileMsIdentity` is the single find-or-link-or-create used by every path
 * that mints a `users` row from a Microsoft account (admin sync-entra, Nexus
 * login). It tries five keys in order and, on a match, ATTACHES the ms_oid onto
 * the existing row instead of creating a new one:
 *
 *   1. ms_oid                      (already the right row)
 *   2. linked_classroom_email      (admin pre-recorded the UPN on the Google row)
 *   3. email == UPN                (a row already keyed on the classroom address)
 *   4. phone                       (Graph mobilePhone vs users.phone)  <-- catches the Google row
 *   5. personal email              (Graph otherMails/mail vs users.email or personal_email)
 *
 * Steps 4-5 are the new signals that reconcile a Microsoft account back to the
 * person's existing Google row. The phone/otherMails hints come from Microsoft
 * Graph, resolved by the CALLER (which may import @neram/auth); this module keeps
 * the database package free of any Graph dependency, mirroring user-merge.ts.
 *
 * SAFETY: a candidate is only linked when it has no ms_oid, or the same ms_oid.
 * A row already holding a DIFFERENT ms_oid is a distinct Microsoft person and is
 * never hijacked; reconciliation falls through (and creates, if allowed).
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import { getUserByPhone } from './users';

export type MsReconcileAction =
  | 'matched_ms_oid'
  | 'linked_by_classroom_email'
  | 'linked_by_email'
  | 'linked_by_phone'
  | 'linked_by_personal_email'
  | 'created'
  | 'unmatched';

export interface ReconcileMsIdentityInput {
  /** Entra object id of the Microsoft account (the authoritative key). */
  msOid: string;
  /** The Microsoft UPN / classroom email, e.g. Firstname@neramclasses.com. */
  upn: string;
  /** Display name, used only when a row must be created. */
  name?: string | null;
  /** Phone candidates from Graph (mobilePhone, businessPhones). Used for match #4. */
  phoneHints?: (string | null | undefined)[];
  /** Alternate personal emails from Graph (otherMails, mail). Used for match #5. */
  emailHints?: (string | null | undefined)[];
  /** Extra columns to set when a brand-new row is created (e.g. first_name). */
  createDefaults?: Record<string, unknown>;
  /** When false, an unmatched identity returns { user: null } instead of inserting. */
  allowCreate?: boolean;
  /**
   * Preview only: return the row that WOULD be matched/linked without writing
   * anything, and never insert. Used by the admin picker to show the suggested
   * link before the admin confirms. `linked` is always false in dry-run.
   */
  dryRun?: boolean;
}

export interface ReconcileMsIdentityResult {
  user: any | null;
  action: MsReconcileAction;
  /** True when this call newly attached the ms_oid to a pre-existing row. */
  linked: boolean;
}

/** Escape a value for a case-insensitive ILIKE so _ and % are literal, not wildcards. */
function escapeIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
}

/** A candidate may be linked only if it holds no ms_oid, or the same one. */
function isLinkable(candidate: any, msOid: string): boolean {
  return !!candidate && (!candidate.ms_oid || candidate.ms_oid === msOid);
}

export async function reconcileMsIdentity(
  client: TypedSupabaseClient | undefined,
  input: ReconcileMsIdentityInput,
): Promise<ReconcileMsIdentityResult> {
  const supabase = client || getSupabaseAdminClient();
  const { msOid, upn, allowCreate = true, dryRun = false } = input;
  if (!msOid) throw new Error('reconcileMsIdentity: msOid is required');

  // Attach the ms_oid (and record the classroom email) onto an existing row.
  // In dryRun mode the match is returned without any write.
  async function link(row: any, action: MsReconcileAction): Promise<ReconcileMsIdentityResult> {
    if (dryRun) return { user: row, action, linked: false };
    const updates: Record<string, unknown> = {};
    if (!row.ms_oid) updates.ms_oid = msOid;
    if (upn && !row.linked_classroom_email) {
      updates.linked_classroom_email = upn;
      updates.linked_classroom_at = new Date().toISOString();
    }
    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      await supabase.from('users').update(updates).eq('id', row.id);
    }
    return { user: { ...row, ...updates }, action, linked: Object.keys(updates).length > 0 };
  }

  // 1) ms_oid — already the right row.
  {
    const { data } = await supabase.from('users').select('*').eq('ms_oid', msOid).maybeSingle();
    if (data) return { user: data, action: 'matched_ms_oid', linked: false };
  }

  const safeUpn = upn ? escapeIlike(upn) : null;

  // 2) linked_classroom_email == UPN (admin already recorded the link).
  if (safeUpn) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .ilike('linked_classroom_email', safeUpn)
      .maybeSingle();
    if (isLinkable(data, msOid)) return link(data, 'linked_by_classroom_email');
  }

  // 3) email == UPN (a row keyed directly on the classroom address).
  if (safeUpn) {
    const { data } = await supabase.from('users').select('*').ilike('email', safeUpn).maybeSingle();
    if (isLinkable(data, msOid)) return link(data, 'linked_by_email');
  }

  // 4) phone — the strongest signal that reconciles to the pre-existing Google row.
  for (const hint of input.phoneHints || []) {
    if (!hint) continue;
    const candidate = await getUserByPhone(hint, supabase).catch(() => null);
    if (isLinkable(candidate, msOid)) return link(candidate, 'linked_by_phone');
  }

  // 5) personal email — Graph otherMails/mail vs users.email or users.personal_email.
  for (const hint of input.emailHints || []) {
    if (!hint || !hint.includes('@')) continue;
    const safe = escapeIlike(hint);
    const { data } = await supabase
      .from('users')
      .select('*')
      .or(`email.ilike.${safe},personal_email.ilike.${safe}`)
      .limit(1);
    const candidate = data && data.length > 0 ? data[0] : null;
    if (isLinkable(candidate, msOid)) return link(candidate, 'linked_by_personal_email');
  }

  // No existing row for this person.
  if (dryRun || !allowCreate) return { user: null, action: 'unmatched', linked: false };

  const { data: created, error } = await supabase
    .from('users')
    .insert({
      name: input.name || upn?.split('@')[0] || null,
      email: upn,
      ms_oid: msOid,
      user_type: 'student',
      status: 'active',
      email_verified: true,
      ...(input.createDefaults || {}),
    })
    .select()
    .single();
  if (error) throw new Error(`reconcileMsIdentity: user creation failed: ${error.message}`);
  return { user: created, action: 'created', linked: false };
}
