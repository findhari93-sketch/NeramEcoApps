/**
 * Links asking a student to fill in their own application details.
 *
 * Shared by Nexus (the Students screen makes and shows them), Admin (the same
 * button on the student drawer) and Marketing (the public page the student opens),
 * so all three agree on what a live link is.
 *
 * The row is the authority, not the token: expiry, cancellation and "already
 * answered" are all read from here on every request. That is the property a signed
 * stateless token would have cost us, and these links sit in WhatsApp threads for a
 * fortnight, so being able to withdraw one matters more than saving a query.
 */

import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export type StudentDetailRequestStatus = 'active' | 'answered' | 'expired' | 'cancelled';

export interface StudentDetailRequest {
  id: string;
  user_id: string;
  token: string;
  status: StudentDetailRequestStatus;
  created_by: string | null;
  created_at: string;
  expires_at: string;
  sent_at: string | null;
  sent_by: string | null;
  opened_at: string | null;
  answered_at: string | null;
  updated_at: string | null;
  lead_profile_id: string | null;
  open_count: number;
  cancelled_by: string | null;
  cancelled_at: string | null;
}

const TABLE = 'student_detail_requests';

/** How long a link works for. Long enough to survive a school week and a weekend. */
export const DETAIL_REQUEST_TTL_DAYS = 14;

/**
 * 32 random bytes, base64url. The direct-enrollment link uses 16; this one is
 * doubled because it lives for a fortnight in a chat thread rather than minutes in
 * a call. At 256 bits, guessing a token is not a threat model, which is why there
 * is no attempt limiter beyond open_count for visibility.
 */
export function mintDetailRequestToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Mark every live link whose time has passed as expired, lazily.
 *
 * Called at the top of every read rather than from a cron, copying
 * expireOldDirectEnrollmentLinks. A cron would leave a window where an expired
 * link still worked, and would cost a scheduled invocation to do nothing most days.
 */
export async function expireOldDetailRequests(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status: 'expired' as StudentDetailRequestStatus })
    .in('status', ['active', 'answered'])
    .lt('expires_at', new Date().toISOString())
    .select('id');

  if (error) throw error;
  return data?.length || 0;
}

/**
 * The live request for a student, or null.
 * 'answered' counts as live: a student who mistyped their date of birth needs the
 * link to still open so they can correct it.
 */
export async function getLiveDetailRequestForUser(
  userId: string,
  supabase: SupabaseClient,
): Promise<StudentDetailRequest | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .in('status', ['active', 'answered'])
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as StudentDetailRequest) || null;
}

/**
 * The live request for each of these students, keyed by user id.
 * One query for a whole classroom, so the Students screen does not fan out.
 */
export async function listLiveDetailRequests(
  userIds: readonly string[],
  supabase: SupabaseClient,
): Promise<Record<string, StudentDetailRequest>> {
  if (!userIds.length) return {};

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .in('user_id', userIds as string[])
    .in('status', ['active', 'answered'])
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) throw error;

  const byUser: Record<string, StudentDetailRequest> = {};
  for (const row of (data || []) as StudentDetailRequest[]) {
    // Ordered newest first, so the first one seen for a user is the one that counts.
    if (!byUser[row.user_id]) byUser[row.user_id] = row;
  }
  return byUser;
}

/** Withdraw a link. After this the token opens nothing. */
export async function cancelDetailRequest(
  id: string,
  cancelledBy: string | null,
  supabase: SupabaseClient,
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({
      status: 'cancelled' as StudentDetailRequestStatus,
      cancelled_by: cancelledBy,
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
}

/**
 * The live link for a student, making one if there is none.
 *
 * Reusing rather than always minting is deliberate: a member of staff who presses
 * the button twice must not invalidate the link they already sent. Pass
 * `regenerate` only when the student says the link is broken, and note that it
 * cancels the old row FIRST, because student_detail_requests_one_active is a
 * partial unique index and an insert-then-cancel order would be refused.
 */
export async function createOrReuseDetailRequest(
  input: { userId: string; createdBy: string | null; regenerate?: boolean },
  supabase: SupabaseClient,
): Promise<{ request: StudentDetailRequest; reused: boolean }> {
  await expireOldDetailRequests(supabase);

  const existing = await getLiveDetailRequestForUser(input.userId, supabase);
  if (existing && !input.regenerate) {
    return { request: existing, reused: true };
  }
  if (existing) {
    await cancelDetailRequest(existing.id, input.createdBy, supabase);
  }

  const expiresAt = new Date(Date.now() + DETAIL_REQUEST_TTL_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: input.userId,
      token: mintDetailRequestToken(),
      created_by: input.createdBy,
      expires_at: expiresAt,
    })
    .select('*')
    .single();

  if (error) throw error;
  return { request: data as StudentDetailRequest, reused: false };
}

/** Record that staff copied the link. Only ever set once, on the first copy. */
export async function markDetailRequestSent(
  id: string,
  sentBy: string | null,
  supabase: SupabaseClient,
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ sent_at: new Date().toISOString(), sent_by: sentBy })
    .eq('id', id)
    .is('sent_at', null);

  if (error) throw error;
}

export type DetailRequestRefusal = 'not_found' | 'expired' | 'cancelled';

/**
 * Look a token up for the public page.
 *
 * Returns a refusal rather than throwing, because each one is a different sentence
 * the student needs to read and a different thing for them to do next.
 */
export async function getDetailRequestByToken(
  token: string,
  supabase: SupabaseClient,
): Promise<{ request: StudentDetailRequest } | { refusal: DetailRequestRefusal }> {
  if (!token || typeof token !== 'string') return { refusal: 'not_found' };

  await expireOldDetailRequests(supabase);

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { refusal: 'not_found' };

  const request = data as StudentDetailRequest;
  if (request.status === 'cancelled') return { refusal: 'cancelled' };
  if (request.status === 'expired') return { refusal: 'expired' };
  // Belt and braces: expireOldDetailRequests should have caught this already, but a
  // link that is one millisecond past its time must never open.
  if (new Date(request.expires_at).getTime() <= Date.now()) return { refusal: 'expired' };

  return { request };
}

/** Count a visit. Stamps opened_at the first time only. */
export async function markDetailRequestOpened(
  request: StudentDetailRequest,
  supabase: SupabaseClient,
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({
      opened_at: request.opened_at ?? new Date().toISOString(),
      open_count: (request.open_count || 0) + 1,
    })
    .eq('id', request.id);

  // A visit counter must never be the reason a student cannot open their form.
  if (error) console.warn('[detail-request] could not record an open:', error.message);
}

/**
 * Record a submission. `answered_at` is stamped once and never moves, so "how long
 * did they take to reply" keeps its meaning across later corrections; `updated_at`
 * moves instead.
 */
export async function markDetailRequestAnswered(
  request: StudentDetailRequest,
  leadProfileId: string | null,
  supabase: SupabaseClient,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from(TABLE)
    .update({
      status: 'answered' as StudentDetailRequestStatus,
      answered_at: request.answered_at ?? now,
      updated_at: now,
      lead_profile_id: leadProfileId,
    })
    .eq('id', request.id);

  if (error) throw error;
}

/** What staff see next to a student's name on the Students screen. */
export type DetailRequestProgress = 'not_asked' | 'asked' | 'opened' | 'answered';

export function detailRequestProgress(
  request: StudentDetailRequest | null | undefined,
): DetailRequestProgress {
  if (!request) return 'not_asked';
  if (request.answered_at) return 'answered';
  if (request.opened_at) return 'opened';
  return 'asked';
}
