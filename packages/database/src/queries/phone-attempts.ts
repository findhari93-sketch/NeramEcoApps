/**
 * Every number a student types into a phone-OTP dialog (table phone_attempts).
 *
 * Saved the moment Send OTP is tapped, signed in or not, so staff can still
 * call a student whose OTP never went out. Signed-out attempts carry the
 * visitor's anonymous id and move onto the account at sign-up
 * (linkPhoneAttempts). The writes are SQL functions so the attempt count and
 * the "verified never goes back" rule hold under parallel calls.
 * Server-only: defaults to the service-role client.
 */

import type { TypedSupabaseClient } from '../client';
import { getSupabaseAdminClient } from '../client';
import { ANON_ID_COOKIE, isValidAnonymousId, readCookie } from '../analytics';

const db = (client?: TypedSupabaseClient): any => client ?? getSupabaseAdminClient();

export type PhoneAttemptEvent = 'entered' | 'otp_sent' | 'failed' | 'verified';
export const PHONE_ATTEMPT_EVENTS: readonly PhoneAttemptEvent[] = ['entered', 'otp_sent', 'failed', 'verified'];

export interface PhoneAttempt {
  id: string;
  user_id: string | null;
  anonymous_id: string | null;
  phone: string;
  status: PhoneAttemptEvent;
  attempts: number;
  source: string | null;
  source_app: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  first_seen_at: string;
  last_attempt_at: string;
  verified_at: string | null;
}

/** An unverified attempt with the account it belongs to, if any (Admin list). */
export interface UnverifiedPhoneAttempt extends PhoneAttempt {
  user: { id: string; name: string | null; email: string | null } | null;
}

export function isPhoneAttemptEvent(value: unknown): value is PhoneAttemptEvent {
  return typeof value === 'string' && (PHONE_ATTEMPT_EVENTS as readonly string[]).includes(value);
}

/**
 * The dialog's number as E.164: "+" and 8 to 15 digits, or a bare 10-digit
 * Indian number. Anything else is null and is not stored.
 */
export function normalizeAttemptPhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  return digits.length === 10 ? `+91${digits}` : null;
}

/** Page path only, never a query string (it can carry tokens). */
export function attemptSource(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return null;
  return raw.split(/[?#]/)[0].slice(0, 120);
}

export interface PhoneCaptureRequest {
  phone: string;
  /** Never 'verified': only verify-phone, which checks the OTP, may set it. */
  event: Exclude<PhoneAttemptEvent, 'verified'>;
  anonymousId: string | null;
  source: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

/**
 * Read a capture-phone request body (the app's and marketing's routes share
 * it). The anonymous id comes from the body (cross-origin callers) or the
 * shared .neramclasses.com cookie. Returns null for a body that cannot be
 * stored: a bad number or an unknown event.
 */
export function parsePhoneCaptureBody(body: any, cookieHeader: string | null): PhoneCaptureRequest | null {
  const phone = normalizeAttemptPhone(body?.phoneNumber);
  if (!phone) return null;
  const event = body?.event ?? 'entered';
  if (!isPhoneAttemptEvent(event) || event === 'verified') return null;
  const fromCookie = readCookie(cookieHeader, ANON_ID_COOKIE);
  const anonymousId = isValidAnonymousId(body?.anonymousId)
    ? body.anonymousId
    : isValidAnonymousId(fromCookie) ? fromCookie : null;
  const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  return {
    phone,
    event,
    anonymousId,
    source: attemptSource(body?.source),
    errorCode: event === 'failed' ? text(body?.errorCode, 80) : null,
    errorMessage: event === 'failed' ? text(body?.errorMessage, 300) : null,
  };
}

/**
 * Record one event for one number. Needs an account or an anonymous id; with
 * neither it does nothing. Never throws: losing a backup number must never
 * block a sign-in.
 */
export async function recordPhoneAttempt(
  input: {
    userId?: string | null;
    anonymousId?: string | null;
    phone: string;
    event: PhoneAttemptEvent;
    source?: string | null;
    sourceApp?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<boolean> {
  if (!input.userId && !input.anonymousId) return false;
  try {
    const { error } = await db(client).rpc('record_phone_attempt', {
      p_user_id: input.userId ?? null,
      p_anonymous_id: input.anonymousId ?? null,
      p_phone: input.phone,
      p_event: input.event,
      p_source: input.source ?? null,
      p_source_app: input.sourceApp ?? null,
      p_error_code: input.errorCode ? String(input.errorCode).slice(0, 80) : null,
      p_error_message: input.errorMessage ? String(input.errorMessage).slice(0, 300) : null,
    });
    if (error) {
      console.error('recordPhoneAttempt failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('recordPhoneAttempt failed:', err);
    return false;
  }
}

/** Move a visitor's signed-out attempts onto the account. Never throws. */
export async function linkPhoneAttempts(
  anonymousId: string | null | undefined,
  userId: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  if (!anonymousId || !userId) return;
  try {
    const { error } = await db(client).rpc('link_phone_attempts', {
      p_anonymous_id: anonymousId,
      p_user_id: userId,
    });
    if (error) console.error('linkPhoneAttempts failed:', error.message);
  } catch (err) {
    console.error('linkPhoneAttempts failed:', err);
  }
}

/** All numbers an account tried, verified first, then most recent. */
export async function getPhoneAttemptsForUser(
  userId: string,
  client?: TypedSupabaseClient,
): Promise<PhoneAttempt[]> {
  const { data, error } = await db(client)
    .from('phone_attempts')
    .select('*')
    .eq('user_id', userId)
    .order('last_attempt_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  const rows = (data ?? []) as PhoneAttempt[];
  return [...rows].sort((a, b) => Number(b.status === 'verified') - Number(a.status === 'verified'));
}

/**
 * Numbers nobody has verified yet, newest first: people stuck at phone
 * sign-in whom staff can still call. A number that some account later
 * verified drops off (the view checks both tables).
 */
export async function listUnverifiedPhoneAttempts(
  options: { days?: number; limit?: number } = {},
  client?: TypedSupabaseClient,
): Promise<UnverifiedPhoneAttempt[]> {
  const days = Math.min(Math.max(options.days ?? 30, 1), 180);
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db(client)
    .from('phone_attempts_unverified')
    .select('*')
    .gte('last_attempt_at', since)
    .order('last_attempt_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as PhoneAttempt[];

  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];
  const users = new Map<string, { id: string; name: string | null; email: string | null }>();
  if (userIds.length) {
    const { data: userRows, error: userError } = await db(client)
      .from('users')
      .select('id, name, email')
      .in('id', userIds);
    if (userError) throw userError;
    for (const u of userRows ?? []) users.set(u.id, u);
  }
  return rows.map((r) => ({ ...r, user: r.user_id ? users.get(r.user_id) ?? null : null }));
}
