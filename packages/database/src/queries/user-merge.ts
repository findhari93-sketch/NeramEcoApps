// @ts-nocheck - personal_email + merge RPC not yet in generated Supabase types; regenerate with pnpm supabase:gen:types
/**
 * Duplicate-user detection, merge, and editable personal details.
 *
 * Some students have two `users` rows: an @neramclasses.com row (often ms_oid
 * NULL) and a personal-Gmail row holding the real ms_oid. The merge keeps the
 * @neramclasses.com address as the primary identity and the Gmail in
 * users.personal_email, repoints every reference, and hard-deletes the loser.
 *
 * The Microsoft email->oid resolution (Graph) lives in the API route (which can
 * import @neram/auth). This module only does DB lookups + the merge RPC + the
 * personal-details writer, so the database package has no Graph dependency.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';

const NERAM_DOMAIN_RE = /@(neramclasses\.com|neram\.co\.in)$/i;

export interface MergeUserRow {
  id: string;
  name: string | null;
  email: string | null;
  personal_email?: string | null;
  ms_oid: string | null;
  firebase_uid: string | null;
  google_id: string | null;
  phone: string | null;
  date_of_birth: string | null;
  academic_year: string | null;
  is_alumni: boolean;
}

const MERGE_ROW_COLS =
  'id, name, email, personal_email, ms_oid, firebase_uid, google_id, phone, date_of_birth, academic_year, is_alumni';

/** Look up a user row by its Microsoft object id (ms_oid). */
export async function findUserRowByMsOid(
  msOid: string,
  client?: TypedSupabaseClient,
): Promise<MergeUserRow | null> {
  if (!msOid) return null;
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase.from('users').select(MERGE_ROW_COLS).eq('ms_oid', msOid).maybeSingle();
  return (data as MergeUserRow) || null;
}

/** Look up a user row by exact email (case-insensitive). */
export async function findUserRowByEmail(
  email: string,
  client?: TypedSupabaseClient,
): Promise<MergeUserRow | null> {
  if (!email) return null;
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase.from('users').select(MERGE_ROW_COLS).ilike('email', email).maybeSingle();
  return (data as MergeUserRow) || null;
}

export function isNeramEmail(email: string | null | undefined): boolean {
  return !!email && NERAM_DOMAIN_RE.test(email);
}

/**
 * Pure: given the two rows, decide winner (the @neram-email row) vs loser, and
 * compute the post-merge identity + warnings for the confirm dialog. Mirrors the
 * SQL canonical rule so the preview matches the actual merge.
 */
export function buildMergePreview(a: MergeUserRow, b: MergeUserRow): {
  winner: MergeUserRow;
  loser: MergeUserRow;
  afterMerge: Partial<MergeUserRow>;
  warnings: string[];
} {
  // Winner = the row whose email is on a Neram domain (the official identity).
  const winner = isNeramEmail(a.email) ? a : isNeramEmail(b.email) ? b : a;
  const loser = winner === a ? b : a;

  const neramEmail = isNeramEmail(winner.email)
    ? winner.email
    : isNeramEmail(loser.email)
      ? loser.email
      : winner.email;
  const gmail =
    winner.personal_email ||
    (loser.email && !isNeramEmail(loser.email) ? loser.email : null) ||
    (winner.email && !isNeramEmail(winner.email) ? winner.email : null);

  const warnings: string[] = [];
  if (winner.firebase_uid && loser.firebase_uid && winner.firebase_uid !== loser.firebase_uid) {
    warnings.push('Both rows have a separate app (Firebase) login. The surviving login is kept; the other is archived in the merge record.');
  }
  if (winner.ms_oid && loser.ms_oid && winner.ms_oid !== loser.ms_oid) {
    warnings.push('Both rows have a DIFFERENT Microsoft account, this may be two distinct people, not a duplicate. Merge will be refused.');
  }
  if (!isNeramEmail(a.email) && !isNeramEmail(b.email)) {
    warnings.push('Neither row has an @neramclasses.com email; the first row is treated as primary.');
  }

  const afterMerge: Partial<MergeUserRow> = {
    email: neramEmail,
    personal_email: gmail,
    ms_oid: winner.ms_oid || loser.ms_oid,
    firebase_uid: winner.firebase_uid || loser.firebase_uid,
    phone: winner.phone || loser.phone,
    date_of_birth: winner.date_of_birth || loser.date_of_birth,
    academic_year: winner.academic_year || loser.academic_year,
    is_alumni: winner.is_alumni || loser.is_alumni,
  };

  return { winner, loser, afterMerge, warnings };
}

/** Per-table reference counts for the loser (drives the "what will move" list). */
export async function previewUserMergeCounts(
  loserId: string,
  client?: TypedSupabaseClient,
): Promise<Array<{ table: string; column: string; rows: number }>> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase.rpc('preview_user_merge', { loser_id: loserId });
  if (error) throw error;
  return (data || []).map((r: any) => ({ table: r.ref_table, column: r.ref_column, rows: r.rows }));
}

/**
 * Merge loser into winner (repoint all references, consolidate identity, delete
 * loser). Returns the per-table repoint summary from the SQL function.
 */
export async function mergeUserRecords(
  winnerId: string,
  loserId: string,
  adminId: string | null,
  client?: TypedSupabaseClient,
): Promise<Array<{ table: string; column: string; rows: number }>> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase.rpc('merge_user_records', {
    winner_id: winnerId,
    loser_id: loserId,
    admin_id: adminId,
  });
  if (error) throw error;
  return (data || []).map((r: any) => ({ table: r.ref_table, column: r.ref_column, rows: r.repointed_rows }));
}

// ----------------------------------------------------------------------------
// Feature B: editable personal details (users + lead_profiles, UPSERT)
// ----------------------------------------------------------------------------

const USER_PERSONAL_FIELDS = ['phone', 'personal_email', 'date_of_birth', 'gender', 'name', 'first_name', 'last_name'] as const;
const LEAD_PERSONAL_FIELDS = ['father_name', 'city', 'state', 'school_college'] as const;
const GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'];

export interface PersonalDetailsInput {
  phone?: string | null;
  personal_email?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  father_name?: string | null;
  city?: string | null;
  state?: string | null;
  school_college?: string | null;
}

/**
 * Update a student's personal details. `users` fields update the user row;
 * `lead_profiles` fields UPSERT (insert a lead row for MS-only students who have
 * none). Never changes the primary email here. Returns the refreshed user + lead.
 */
export async function updatePersonalDetails(
  userId: string,
  fields: PersonalDetailsInput,
  adminId: string | null,
  client?: TypedSupabaseClient,
): Promise<{ user: any; leadProfile: any }> {
  const supabase = client || getSupabaseAdminClient();

  if (fields.gender && !GENDERS.includes(fields.gender)) {
    throw new Error(`Invalid gender '${fields.gender}'. Allowed: ${GENDERS.join(', ')}.`);
  }

  const userUpdate: Record<string, unknown> = {};
  for (const f of USER_PERSONAL_FIELDS) {
    if (f in fields) userUpdate[f] = (fields as any)[f];
  }
  if (Object.keys(userUpdate).length > 0) {
    userUpdate.updated_at = new Date().toISOString();
    await supabase.from('users').update(userUpdate).eq('id', userId);
  }

  const leadUpdate: Record<string, unknown> = {};
  for (const f of LEAD_PERSONAL_FIELDS) {
    if (f in fields) leadUpdate[f] = (fields as any)[f];
  }
  if (Object.keys(leadUpdate).length > 0) {
    const { data: existing } = await supabase
      .from('lead_profiles')
      .select('id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (existing?.id) {
      await supabase.from('lead_profiles').update(leadUpdate).eq('id', existing.id);
    } else {
      await supabase.from('lead_profiles').insert({ user_id: userId, source: 'manual', ...leadUpdate });
    }
  }

  const [{ data: user }, { data: leadProfile }] = await Promise.all([
    supabase.from('users').select('*').eq('id', userId).maybeSingle(),
    supabase.from('lead_profiles').select('*').eq('user_id', userId).is('deleted_at', null).maybeSingle(),
  ]);
  return { user, leadProfile };
}
