// @ts-nocheck - user_duplicate_candidates is newer than the generated Database type
/**
 * The duplicate-accounts queue (user_duplicate_candidates).
 *
 * Detection (detect_user_duplicate_candidates) says why each pair matched
 * (evidence), who the other record probably is (relation_guess: the same
 * person, a parent, or not sure) and whether it may merge without a person
 * (auto_ok, else blocked_reason).
 *
 * Policy (2026-10-19): one record per family, so sales never calls a family
 * whose child already enrolled. Safe pairs merge on their own when the
 * "Merge duplicates automatically" setting is on: nightly, and right after a
 * phone is verified or an enrolment completes. Every merge is logged with what
 * it needs to be undone for 30 days (unmergeUserRecords).
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import {
  buildMergePreview,
  mergeUserRecordsLogged,
  previewUserMergeCounts,
  unmergeUserRecords,
  type MergeRelation,
} from './user-merge';
import { UNDO_WINDOW_DAYS } from '../utils/duplicate-evidence';
import { formatPhoneForDisplay, phoneKey } from '../utils/phone';

export type DuplicateReason =
  | 'same_email'
  | 'same_phone'
  | 'classroom_email'
  | 'enrollment_link_phone'
  | 'contact_phone'
  | 'entra_upn'
  | 'phone_otp_conflict'
  | 'application_form'
  | 'staff';

export type DuplicateStatus = 'open' | 'merged' | 'dismissed';
export type DuplicateConfidence = 'strong' | 'likely';
export type DuplicateRelation = MergeRelation;

/** The page's tabs. 'ready' and 'review' are open pairs split by auto_ok. */
export type DuplicateTab = 'ready' | 'review' | 'auto' | 'history';

export const DUPLICATE_REASON_LABELS: Record<DuplicateReason, string> = {
  same_email: 'Same email address',
  same_phone: 'Same phone number',
  classroom_email: 'Classroom email points to the other record',
  enrollment_link_phone: 'Number typed on an enrolment link',
  contact_phone: 'Family number on the other record',
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
  evidence: Record<string, any> | null;
  relation_guess: DuplicateRelation | null;
  auto_ok: boolean;
  blocked_reason: string | null;
  resolution: 'auto' | 'staff' | null;
  merge_log_id: string | null;
  /** For a merged pair: the record that was kept (the other one was folded in). */
  kept_id: string | null;
  a: CandidatePerson | null;
  b: CandidatePerson | null;
}

const PERSON_COLS =
  'id, name, email, personal_email, phone, user_type, ms_oid, firebase_uid, avatar_url, created_at, last_login_at, academic_year';

/** Order a pair the way the table stores it (user_a < user_b). */
export function orderPair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

function toPair(r: any, people: Record<string, CandidatePerson>, keptIds: Record<string, string> = {}): DuplicatePair {
  return {
    id: r.id,
    reason: r.reason,
    confidence: r.confidence,
    status: r.status,
    detected_by: r.detected_by,
    detected_at: r.detected_at,
    resolved_by: r.resolved_by,
    resolved_at: r.resolved_at,
    note: r.note,
    evidence: r.evidence ?? null,
    relation_guess: r.relation_guess ?? null,
    auto_ok: Boolean(r.auto_ok),
    blocked_reason: r.blocked_reason ?? null,
    resolution: r.resolution ?? null,
    merge_log_id: r.merge_log_id ?? null,
    kept_id: r.merge_log_id ? keptIds[r.merge_log_id] ?? null : null,
    a: people[r.user_a] ?? null,
    b: people[r.user_b] ?? null,
  };
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
    detectedBy?: 'sweep' | 'signin' | 'staff' | 'import' | 'enrolment';
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

/**
 * Candidates with both people attached, for one tab of the page (or a status,
 * for older callers). Pairs whose rows are gone are skipped.
 */
export async function listDuplicateCandidates(
  options: { status?: DuplicateStatus; tab?: DuplicateTab; limit?: number; offset?: number; userId?: string } = {},
  client?: TypedSupabaseClient,
): Promise<{ candidates: DuplicatePair[]; total: number }> {
  const supabase = client || getSupabaseAdminClient();
  const { tab, limit = 50, offset = 0, userId } = options;
  const status: DuplicateStatus | null =
    tab === 'ready' || tab === 'review' ? 'open' : tab === 'auto' ? 'merged' : tab === 'history' ? null : options.status ?? 'open';

  let query = supabase.from('user_duplicate_candidates').select('*', { count: 'exact' });
  if (status) query = query.eq('status', status);
  if (tab === 'ready') query = query.eq('auto_ok', true);
  if (tab === 'review') query = query.eq('auto_ok', false);
  if (tab === 'auto') query = query.eq('resolution', 'auto');
  if (tab === 'history') query = query.or('status.eq.dismissed,and(status.eq.merged,resolution.neq.auto),and(status.eq.merged,resolution.is.null)');
  if (userId) query = query.or(`user_a.eq.${userId},user_b.eq.${userId}`);

  query =
    tab === 'auto' || tab === 'history'
      ? query.order('resolved_at', { ascending: false, nullsFirst: false })
      : query.order('confidence', { ascending: false }).order('detected_at', { ascending: false });

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) throw error;
  const rows = data || [];

  const ids = [...new Set(rows.flatMap((r) => [r.user_a, r.user_b]))];
  const people: Record<string, CandidatePerson> = {};
  if (ids.length) {
    const { data: users, error: usersError } = await supabase.from('users').select(PERSON_COLS).in('id', ids);
    if (usersError) throw usersError;
    for (const u of users || []) people[u.id] = u;
  }

  // Merged pairs: the folded-in record is gone, so show it from the merge log.
  const logIds = rows.map((r) => r.merge_log_id).filter(Boolean);
  const keptIds: Record<string, string> = {};
  if (logIds.length) {
    const { data: logs } = await supabase
      .from('user_merge_log')
      .select('id, winner_id, loser_id, loser_snapshot')
      .in('id', logIds);
    for (const log of logs || []) {
      keptIds[log.id] = log.winner_id;
      if (people[log.loser_id]) continue;
      const snap = log.loser_snapshot || {};
      people[log.loser_id] = {
        id: log.loser_id,
        name: snap.name ?? null,
        email: snap.email ?? null,
        personal_email: null,
        phone: snap.phone ?? null,
        user_type: snap.user_type ?? null,
        ms_oid: snap.ms_oid ?? null,
        firebase_uid: snap.firebase_uid ?? null,
        avatar_url: null,
        created_at: snap.created_at ?? null,
        last_login_at: null,
        academic_year: null,
      };
    }
  }

  const candidates = rows
    .map((r) => toPair(r, people, keptIds))
    .filter((c) => c.status !== 'open' || (c.a && c.b));

  return { candidates, total: count ?? candidates.length };
}

/** Open pairs waiting for a person (the nav badge). Ready pairs merge on their own. */
export async function countOpenDuplicateCandidates(client?: TypedSupabaseClient): Promise<number> {
  const counts = await countDuplicateTabs(client);
  return counts.review;
}

/** Counts for the tab labels. */
export async function countDuplicateTabs(
  client?: TypedSupabaseClient,
): Promise<{ ready: number; review: number; auto: number }> {
  const supabase = client || getSupabaseAdminClient();
  const head = { count: 'exact' as const, head: true };
  const [ready, review, auto] = await Promise.all([
    supabase.from('user_duplicate_candidates').select('id', head).eq('status', 'open').eq('auto_ok', true),
    supabase.from('user_duplicate_candidates').select('id', head).eq('status', 'open').eq('auto_ok', false),
    supabase.from('user_duplicate_candidates').select('id', head).eq('status', 'merged').eq('resolution', 'auto'),
  ]);
  // Before the v2 columns exist every open pair needs a person.
  if (ready.error || review.error) {
    const { count } = await supabase.from('user_duplicate_candidates').select('id', head).eq('status', 'open');
    return { ready: 0, review: count ?? 0, auto: 0 };
  }
  return { ready: ready.count ?? 0, review: review.count ?? 0, auto: auto.count ?? 0 };
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
    .update({
      status: 'dismissed',
      resolved_by: adminId,
      resolved_at: new Date().toISOString(),
      resolution: 'staff',
      auto_ok: false,
      note: note.slice(0, 500),
    })
    .eq('id', candidateId)
    .eq('status', 'open');
  if (error) throw error;
}

/**
 * Run detection now (the "Scan now" button, the cron, and the per-person checks
 * after a phone is verified or an enrolment completes). With `userId` only that
 * person's pairs are looked at.
 */
export async function runDuplicateDetection(userId?: string | null, client?: TypedSupabaseClient): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = userId
    ? await supabase.rpc('detect_user_duplicate_candidates', { p_user_id: userId })
    : await supabase.rpc('detect_user_duplicate_candidates');
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
  return { ...toPair(row, byId), user_a: row.user_a, user_b: row.user_b };
}

/**
 * Which row survives a same-person merge.
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

/**
 * In a family merge the child's record is kept: the student, else the record
 * with a Microsoft account, else the named one, else the busier one.
 */
export function chooseFamilySurvivor<
  T extends { id: string; name: string | null; user_type?: string | null; ms_oid?: string | null },
>(x: T, y: T, refs: { [id: string]: number }): [T, T] {
  const score = (p: T) =>
    (p.user_type === 'student' ? 8 : 0) +
    (p.ms_oid ? 4 : 0) +
    (p.name && p.name.trim() && p.name.trim().toLowerCase() !== 'user' ? 2 : 0);
  const sx = score(x);
  const sy = score(y);
  if (sx !== sy) return sx > sy ? [x, y] : [y, x];
  return (refs[x.id] ?? 0) >= (refs[y.id] ?? 0) ? [x, y] : [y, x];
}

const MERGE_ROW_COLS =
  'id, name, email, personal_email, ms_oid, firebase_uid, google_id, phone, date_of_birth, academic_year, is_alumni, created_at, avatar_url, user_type';

export class DuplicateQueueError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function totalRows(counts: Array<{ rows: number }>): number {
  return counts.reduce((s, c) => s + (c.rows || 0), 0);
}

/**
 * The pair, who survives, what moves and what is saved, and why a merge would
 * be refused. `relation` overrides the detected guess (the review drawer's
 * "This number belongs to" choice).
 */
export async function prepareCandidateMerge(
  candidateId: string,
  relationOverride?: DuplicateRelation | null,
  client?: TypedSupabaseClient,
) {
  const supabase = client || getSupabaseAdminClient();
  const candidate = await getDuplicateCandidate(candidateId, supabase);
  if (!candidate) throw new DuplicateQueueError('This duplicate is no longer in the queue.', 404);

  const { data: rows, error } = await supabase
    .from('users')
    .select(MERGE_ROW_COLS)
    .in('id', [candidate.user_a, candidate.user_b]);
  if (error) throw error;
  const x = rows?.find((r) => r.id === candidate.user_a);
  const y = rows?.find((r) => r.id === candidate.user_b);
  if (!x || !y) throw new DuplicateQueueError('One of these records no longer exists.', 409);

  const [countsX, countsY] = await Promise.all([
    previewUserMergeCounts(x.id, supabase).catch(() => []),
    previewUserMergeCounts(y.id, supabase).catch(() => []),
  ]);
  const refs = { [x.id]: totalRows(countsX), [y.id]: totalRows(countsY) };
  const relation: DuplicateRelation = relationOverride || candidate.relation_guess || 'self';

  let preview: ReturnType<typeof buildMergePreview>;
  if (relation === 'self') {
    const [first, second] = chooseSurvivorOrder(x, y, refs);
    preview = buildMergePreview(first, second);
  } else {
    const [winner, loser] = chooseFamilySurvivor(x, y, refs);
    // What merge_user_records will actually save: numbers and emails the
    // student does not already have.
    const own = new Set([winner.email, winner.personal_email].filter(Boolean).map((e: string) => e.toLowerCase()));
    const saved = [
      loser.phone && phoneKey(loser.phone) !== phoneKey(winner.phone) ? formatPhoneForDisplay(loser.phone) : null,
      ...[loser.email, loser.personal_email].filter((e) => e && !own.has(String(e).toLowerCase())),
    ].filter(Boolean);
    preview = {
      winner,
      loser,
      afterMerge: {
        email: winner.email,
        personal_email: winner.personal_email,
        ms_oid: winner.ms_oid || loser.ms_oid,
        firebase_uid: winner.firebase_uid,
        phone: winner.phone,
        date_of_birth: winner.date_of_birth,
        academic_year: winner.academic_year,
        is_alumni: winner.is_alumni || loser.is_alumni,
      },
      warnings: [
        `${winner.name || 'The kept record'} keeps their own name, email and phone.` +
          (saved.length ? ` ${saved.join(', ')} will be saved on it as ${relation === 'parent' ? 'a parent' : 'a family'} contact.` : ''),
        ...(loser.firebase_uid ? ['Whoever signs in with the folded-in login will reach this record.'] : []),
      ],
    };
  }
  const referenceCounts = preview.loser.id === x.id ? countsX : countsY;
  const refused =
    !!preview.winner.ms_oid && !!preview.loser.ms_oid && preview.winner.ms_oid !== preview.loser.ms_oid;

  return {
    candidate,
    relation,
    winnerId: preview.winner.id,
    loserId: preview.loser.id,
    preview: { ...preview, referenceCounts },
    refused,
  };
}

/**
 * Merge one pair. Re-derives the survivor server-side; never trusts the client.
 * Returns the merge-log id the Undo button needs.
 */
export async function mergeDuplicateCandidate(
  candidateId: string,
  options: {
    adminId: string | null;
    via?: 'staff' | 'auto' | 'signin';
    relation?: DuplicateRelation | null;
    expectedLoserId?: string;
  },
  client?: TypedSupabaseClient,
): Promise<{ winnerId: string; loserId: string; logId: string | null; relation: DuplicateRelation; summary: Array<{ table: string; column: string; rows: number }> }> {
  const supabase = client || getSupabaseAdminClient();
  const prepared = await prepareCandidateMerge(candidateId, options.relation, supabase);
  const { candidate, winnerId, loserId, refused, relation } = prepared;
  if (candidate.status !== 'open') throw new DuplicateQueueError('This duplicate was already resolved.', 409);
  if (refused) {
    throw new DuplicateQueueError(
      'The two records have different Microsoft accounts. They are two people, not a duplicate. Merge refused.',
      409,
    );
  }
  if (options.expectedLoserId && options.expectedLoserId !== loserId) {
    throw new DuplicateQueueError('The records changed since you reviewed them. Reopen the pair and try again.', 409);
  }
  const { summary, logId } = await mergeUserRecordsLogged(
    winnerId,
    loserId,
    options.adminId,
    {
      relation,
      via: options.via ?? 'staff',
      evidence: candidate.evidence ? { ...candidate.evidence, reason: candidate.reason } : { reason: candidate.reason },
      candidateId: candidate.id,
    },
    supabase,
  );
  return { winnerId, loserId, logId, relation, summary };
}

export interface BulkMergeResult {
  merged: Array<{ candidateId: string; winnerId: string; loserId: string; logId: string | null }>;
  failed: Array<{ candidateId: string; error: string }>;
}

/** Merge several pairs one after another; one failure never stops the rest. */
export async function mergeDuplicateCandidates(
  candidateIds: string[],
  options: { adminId: string | null; via?: 'staff' | 'auto' | 'signin' },
  client?: TypedSupabaseClient,
): Promise<BulkMergeResult> {
  const supabase = client || getSupabaseAdminClient();
  const result: BulkMergeResult = { merged: [], failed: [] };
  for (const candidateId of [...new Set(candidateIds)]) {
    try {
      const r = await mergeDuplicateCandidate(candidateId, { adminId: options.adminId, via: options.via }, supabase);
      result.merged.push({ candidateId, winnerId: r.winnerId, loserId: r.loserId, logId: r.logId });
    } catch (e: any) {
      result.failed.push({ candidateId, error: e?.message || 'Merge failed' });
    }
  }
  return result;
}

// ----------------------------------------------------------------------------
// Automatic merging
// ----------------------------------------------------------------------------

const SETTINGS_KEY = 'duplicates';

export interface DuplicateSettings {
  autoMergeEnabled: boolean;
}

export async function getDuplicateSettings(client?: TypedSupabaseClient): Promise<DuplicateSettings> {
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase.from('site_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
  return { autoMergeEnabled: Boolean(data?.value?.auto_merge_enabled) };
}

export async function setDuplicateAutoMerge(
  enabled: boolean,
  adminId: string,
  client?: TypedSupabaseClient,
): Promise<DuplicateSettings> {
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase.from('site_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
  const value = { ...(data?.value || {}), auto_merge_enabled: Boolean(enabled) };
  const { error } = await supabase
    .from('site_settings')
    .upsert({ key: SETTINGS_KEY, value, updated_at: new Date().toISOString(), updated_by: adminId });
  if (error) throw error;
  return { autoMergeEnabled: Boolean(enabled) };
}

/**
 * Merge every open pair the guardrails allow. Called by the nightly identity
 * sweep, only when the setting is on (the caller checks). Bounded per run.
 */
export async function runAutoMerge(
  options: { limit?: number; userId?: string | null } = {},
  client?: TypedSupabaseClient,
): Promise<BulkMergeResult> {
  const supabase = client || getSupabaseAdminClient();
  let query = supabase
    .from('user_duplicate_candidates')
    .select('id')
    .eq('status', 'open')
    .eq('auto_ok', true)
    .order('detected_at', { ascending: true })
    .limit(options.limit ?? 100);
  if (options.userId) query = query.or(`user_a.eq.${options.userId},user_b.eq.${options.userId}`);
  const { data, error } = await query;
  if (error) throw error;
  return mergeDuplicateCandidates((data || []).map((r) => r.id), { adminId: null, via: 'auto' }, supabase);
}

/**
 * Check one person right away: after their phone is verified, after they
 * complete an enrolment, after their Microsoft account is created. Finds their
 * pairs and, when automatic merging is on, folds the safe ones in. Never
 * throws: a failure here must not break sign-in or enrolment.
 */
export async function resolveDuplicatesFor(
  userId: string,
  options: { via?: 'auto' | 'signin' } = {},
  client?: TypedSupabaseClient,
): Promise<{ detected: number; merged: number; survivorId: string }> {
  const supabase = client || getSupabaseAdminClient();
  let survivorId = userId;
  try {
    const detected = await runDuplicateDetection(userId, supabase);
    const { autoMergeEnabled } = await getDuplicateSettings(supabase);
    if (!autoMergeEnabled) return { detected, merged: 0, survivorId };
    const { data } = await supabase
      .from('user_duplicate_candidates')
      .select('id')
      .eq('status', 'open')
      .eq('auto_ok', true)
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .limit(5);
    let merged = 0;
    for (const row of data || []) {
      try {
        const r = await mergeDuplicateCandidate(row.id, { adminId: null, via: options.via ?? 'auto' }, supabase);
        merged++;
        if (r.loserId === survivorId) survivorId = r.winnerId;
      } catch (e: any) {
        console.warn('[duplicates] auto merge skipped:', e?.message);
      }
    }
    return { detected, merged, survivorId };
  } catch (e: any) {
    console.warn('[duplicates] resolve failed:', e?.message);
    return { detected: 0, merged: 0, survivorId };
  }
}

// ----------------------------------------------------------------------------
// Undo
// ----------------------------------------------------------------------------


/** Undo a merge from the queue. The pair returns to Needs review. */
export async function undoDuplicateMerge(
  logId: string,
  adminId: string,
  note?: string | null,
  client?: TypedSupabaseClient,
): Promise<{ restoredId: string }> {
  const supabase = client || getSupabaseAdminClient();
  try {
    const restoredId = await unmergeUserRecords(logId, adminId, note ?? null, supabase);
    return { restoredId };
  } catch (e: any) {
    const message = String(e?.message || 'Undo failed').replace(/^undo:\s*/i, '');
    throw new DuplicateQueueError(message.charAt(0).toUpperCase() + message.slice(1), 409);
  }
}

/** Whether a merge-log row can still be undone, for the Undo button. */
export async function getMergeUndoState(
  logIds: string[],
  client?: TypedSupabaseClient,
): Promise<Record<string, { undoable: boolean; undoneAt: string | null; mergedAt: string; relation: string | null }>> {
  const out: Record<string, { undoable: boolean; undoneAt: string | null; mergedAt: string; relation: string | null }> = {};
  if (!logIds.length) return out;
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase
    .from('user_merge_log')
    .select('id, merged_at, undone_at, loser_row, relation')
    .in('id', logIds);
  const cutoff = Date.now() - UNDO_WINDOW_DAYS * 86_400_000;
  for (const r of data || []) {
    out[r.id] = {
      undoable: !r.undone_at && !!r.loser_row && Date.parse(r.merged_at) > cutoff,
      undoneAt: r.undone_at ?? null,
      mergedAt: r.merged_at,
      relation: r.relation ?? null,
    };
  }
  return out;
}

