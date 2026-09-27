// @ts-nocheck - user_duplicate_candidates is newer than the generated Database type
/**
 * The duplicate-accounts queue (user_duplicate_candidates).
 *
 * Detection only proposes. Merging goes through merge_user_records via the admin
 * merge flow, which closes the candidate itself; dismissing records a human's
 * "these are two people" so the pair is never proposed again.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';

export type DuplicateReason =
  | 'same_email'
  | 'same_phone'
  | 'classroom_email'
  | 'enrollment_link_phone'
  | 'entra_upn'
  | 'phone_otp_conflict'
  | 'application_form'
  | 'staff';

export type DuplicateStatus = 'open' | 'merged' | 'dismissed';
export type DuplicateConfidence = 'strong' | 'likely';

export const DUPLICATE_REASON_LABELS: Record<DuplicateReason, string> = {
  same_email: 'Same email address',
  same_phone: 'Same phone number',
  classroom_email: 'Classroom email points to the other record',
  enrollment_link_phone: 'Enrolment link phone matches',
  entra_upn: 'Microsoft account sits on the other record',
  phone_otp_conflict: 'Phone OTP refused: number owned by the other record',
  application_form: 'Application form belongs to the other record',
  staff: 'Flagged by staff',
};

export interface CandidatePerson {
  id: string;
  name: string | null;
  email: string | null;
  personal_email: string | null;
  phone: string | null;
  user_type: string | null;
  ms_oid: string | null;
  firebase_uid: string | null;
  avatar_url: string | null;
  created_at: string | null;
  last_login_at: string | null;
  academic_year: string | null;
}

export interface DuplicatePair {
  id: string;
  reason: DuplicateReason;
  confidence: DuplicateConfidence;
  status: DuplicateStatus;
  detected_by: string;
  detected_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  note: string | null;
  a: CandidatePerson | null;
  b: CandidatePerson | null;
}

const PERSON_COLS =
  'id, name, email, personal_email, phone, user_type, ms_oid, firebase_uid, avatar_url, created_at, last_login_at, academic_year';

/** Order a pair the way the table stores it (user_a < user_b). */
export function orderPair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

/**
 * Propose a pair. Idempotent: an existing row for the pair (open, merged or
 * dismissed) is left exactly as it is, so a dismissed pair stays dismissed.
 * Never throws; returns whether a new row was written.
 */
export async function recordDuplicateCandidate(
  input: {
    userA: string;
    userB: string;
    reason: DuplicateReason;
    confidence?: DuplicateConfidence;
    detectedBy?: 'sweep' | 'signin' | 'staff' | 'import';
    note?: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<boolean> {
  if (!input.userA || !input.userB || input.userA === input.userB) return false;
  const supabase = client || getSupabaseAdminClient();
  const [user_a, user_b] = orderPair(input.userA, input.userB);
  const { data, error } = await supabase
    .from('user_duplicate_candidates')
    .upsert(
      {
        user_a,
        user_b,
        reason: input.reason,
        confidence: input.confidence ?? 'likely',
        detected_by: input.detectedBy ?? 'sweep',
        note: input.note ?? null,
      },
      { onConflict: 'user_a,user_b', ignoreDuplicates: true },
    )
    .select('id');
  if (error) {
    console.warn('[duplicates] candidate not recorded:', error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** Candidates with both people attached. Pairs whose rows are gone are skipped. */
export async function listDuplicateCandidates(
  options: { status?: DuplicateStatus; limit?: number; offset?: number; userId?: string } = {},
  client?: TypedSupabaseClient,
): Promise<{ candidates: DuplicatePair[]; total: number }> {
  const supabase = client || getSupabaseAdminClient();
  const { status = 'open', limit = 50, offset = 0, userId } = options;

  let query = supabase
    .from('user_duplicate_candidates')
    .select('*', { count: 'exact' })
    .eq('status', status)
    // Strong first, then newest.
    .order('confidence', { ascending: false })
    .order('detected_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (userId) query = query.or(`user_a.eq.${userId},user_b.eq.${userId}`);

  const { data, error, count } = await query;
  if (error) throw error;
  const rows = data || [];

  const ids = [...new Set(rows.flatMap((r) => [r.user_a, r.user_b]))];
  const people: Record<string, CandidatePerson> = {};
  if (ids.length) {
    const { data: users, error: usersError } = await supabase.from('users').select(PERSON_COLS).in('id', ids);
    if (usersError) throw usersError;
    for (const u of users || []) people[u.id] = u;
  }

  const candidates = rows
    .map((r) => ({
      id: r.id,
      reason: r.reason,
      confidence: r.confidence,
      status: r.status,
      detected_by: r.detected_by,
      detected_at: r.detected_at,
      resolved_by: r.resolved_by,
      resolved_at: r.resolved_at,
      note: r.note,
      a: people[r.user_a] ?? null,
      b: people[r.user_b] ?? null,
    }))
    .filter((c) => status !== 'open' || (c.a && c.b));

  return { candidates, total: count ?? candidates.length };
}

/** Counts per status for the queue header and the nav badge. */
export async function countOpenDuplicateCandidates(client?: TypedSupabaseClient): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const { count, error } = await supabase
    .from('user_duplicate_candidates')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');
  if (error) return 0;
  return count ?? 0;
}

/** A human decided these are two different people. */
export async function dismissDuplicateCandidate(
  candidateId: string,
  adminId: string,
  note: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase
    .from('user_duplicate_candidates')
    .update({ status: 'dismissed', resolved_by: adminId, resolved_at: new Date().toISOString(), note: note.slice(0, 500) })
    .eq('id', candidateId)
    .eq('status', 'open');
  if (error) throw error;
}

/** Run the nightly SQL pass now (the admin "Scan now" button and the cron route). */
export async function runDuplicateDetection(client?: TypedSupabaseClient): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase.rpc('detect_user_duplicate_candidates');
  if (error) throw error;
  return Number(data) || 0;
}

/**
 * The Microsoft directory pass. For each @neramclasses.com row without an ms_oid,
 * `lookupOid` (Graph, injected by the admin app) finds the account; when another
 * row already holds that oid, the pair is proposed as 'entra_upn'. Bounded so a
 * slow directory cannot run away with the request.
 */
export async function detectEntraDuplicates(
  lookupOid: (email: string) => Promise<string | null>,
  options: { maxLookups?: number } = {},
  client?: TypedSupabaseClient,
): Promise<{ checked: number; added: number }> {
  const supabase = client || getSupabaseAdminClient();
  const { data: rows, error } = await supabase
    .from('users')
    .select('id, email')
    .is('ms_oid', null)
    .in('user_type', ['lead', 'student'])
    .or('email.ilike.%@neramclasses.com,email.ilike.%@neram.co.in')
    .limit(options.maxLookups ?? 60);
  if (error) throw error;

  let added = 0;
  let checked = 0;
  for (const row of rows || []) {
    checked++;
    const oid = await lookupOid(row.email).catch(() => null);
    if (!oid) continue;
    const { data: holder } = await supabase.from('users').select('id').eq('ms_oid', oid).maybeSingle();
    if (holder && holder.id !== row.id) {
      if (await recordDuplicateCandidate({ userA: row.id, userB: holder.id, reason: 'entra_upn', confidence: 'strong' }, supabase)) {
        added++;
      }
    }
  }
  return { checked, added };
}

/** One candidate with both people, or null. */
export async function getDuplicateCandidate(
  candidateId: string,
  client?: TypedSupabaseClient,
): Promise<(DuplicatePair & { user_a: string; user_b: string }) | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data: row, error } = await supabase
    .from('user_duplicate_candidates')
    .select('*')
    .eq('id', candidateId)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;
  const { data: users } = await supabase.from('users').select(PERSON_COLS).in('id', [row.user_a, row.user_b]);
  const byId: Record<string, CandidatePerson> = {};
  for (const u of users || []) byId[u.id] = u;
  return {
    ...row,
    a: byId[row.user_a] ?? null,
    b: byId[row.user_b] ?? null,
  };
}

/**
 * Which row survives a queue merge.
 *
 * An @neramclasses.com row wins as before (buildMergePreview, including its
 * empty-shell exception). When neither row is on an org domain, the row that
 * more records point at wins, then the older row: merge_user_records keeps the
 * winner's id and moves the loser's references, so this moves the smaller side
 * and keeps a student profile or payment history where it already is.
 */
export function chooseSurvivorOrder<T extends { id: string; email: string | null; created_at?: string | null }>(
  x: T,
  y: T,
  refs: { [id: string]: number },
): [T, T] {
  const org = /@(neramclasses\.com|neram\.co\.in)$/i;
  if (org.test(x.email || '') !== org.test(y.email || '')) return [x, y];
  const rx = refs[x.id] ?? 0;
  const ry = refs[y.id] ?? 0;
  if (rx !== ry) return rx > ry ? [x, y] : [y, x];
  const cx = x.created_at ? Date.parse(x.created_at) : Infinity;
  const cy = y.created_at ? Date.parse(y.created_at) : Infinity;
  return cx <= cy ? [x, y] : [y, x];
}
