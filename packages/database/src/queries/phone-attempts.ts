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

/**
 * What the student did after the OTP went out. These annotate the number's
 * row (codes typed, how they left) without moving its status, and never
 * create a row. Together with the error code they tell "the student stopped"
 * from "our sign-in broke".
 */
export type PhoneAttemptSignal = 'otp_checked' | 'help' | 'closed' | 'skipped' | 'tab_closed';
export const PHONE_ATTEMPT_SIGNALS: readonly PhoneAttemptSignal[] = ['otp_checked', 'help', 'closed', 'skipped', 'tab_closed'];

/** One entry of phone_attempts.events: event, ISO time, error code on a failure. */
export interface PhoneAttemptLogEntry {
  e: PhoneAttemptEvent | PhoneAttemptSignal;
  at: string;
  c?: string;
}

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
  /** Codes typed and sent for checking (migration 20261211090100). */
  otp_tries?: number;
  left_via?: 'closed' | 'skipped' | 'tab_closed' | null;
  left_at?: string | null;
  events?: PhoneAttemptLogEntry[];
  device?: string | null;
  browser?: string | null;
  /** The phone-stuck cron alerted staff about this episode. */
  alerted_at?: string | null;
  /** Staff marked this person done. Cleared by their next Send OTP. */
  handled_at?: string | null;
  handled_by?: string | null;
}

/** An unverified attempt with the account it belongs to, if any (Admin list). */
export interface UnverifiedPhoneAttempt extends PhoneAttempt {
  user: { id: string; name: string | null; email: string | null } | null;
}

export function isPhoneAttemptEvent(value: unknown): value is PhoneAttemptEvent {
  return typeof value === 'string' && (PHONE_ATTEMPT_EVENTS as readonly string[]).includes(value);
}

export function isPhoneAttemptSignal(value: unknown): value is PhoneAttemptSignal {
  return typeof value === 'string' && (PHONE_ATTEMPT_SIGNALS as readonly string[]).includes(value);
}

const IN_APP_BROWSERS: Array<[RegExp, string]> = [
  [/Instagram/i, 'Instagram in-app browser'],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, 'Facebook in-app browser'],
  [/WhatsApp/i, 'WhatsApp in-app browser'],
  [/Snapchat/i, 'Snapchat in-app browser'],
  [/LinkedInApp/i, 'LinkedIn in-app browser'],
  [/; wv\)/, 'Android in-app browser (WebView)'],
];

const BROWSERS: Array<[RegExp, string]> = [
  [/EdgA?\/|EdgiOS\//, 'Edge'],
  [/SamsungBrowser/i, 'Samsung Internet'],
  [/OPR\/|Opera/i, 'Opera'],
  [/CriOS|Chrome\//, 'Chrome'],
  [/FxiOS|Firefox\//, 'Firefox'],
  [/Safari\//, 'Safari'],
];

/**
 * The device and browser behind a request, in staff words. In-app browsers
 * (Instagram, Facebook, WhatsApp, an Android WebView) are named, since
 * reCAPTCHA and SMS autofill often break inside them.
 */
export function describeUserAgent(ua: string | null | undefined): { device: string | null; browser: string | null } {
  if (!ua || typeof ua !== 'string') return { device: null, browser: null };
  const device = /iPad/.test(ua)
    ? 'iPad'
    : /iPhone|iPod/.test(ua)
      ? 'iPhone'
      : /Android/.test(ua)
        ? (/Mobile/.test(ua) ? 'Android phone' : 'Android tablet')
        : /Windows|Macintosh|CrOS|Linux/.test(ua)
          ? 'Desktop'
          : null;
  for (const [pattern, label] of IN_APP_BROWSERS) if (pattern.test(ua)) return { device, browser: label };
  for (const [pattern, label] of BROWSERS) if (pattern.test(ua)) return { device, browser: label };
  return { device, browser: null };
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
  event: Exclude<PhoneAttemptEvent, 'verified'> | PhoneAttemptSignal;
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
  if (!(isPhoneAttemptEvent(event) || isPhoneAttemptSignal(event)) || event === 'verified') return null;
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
 * Record one event (or signal) for one number. Needs an account or an
 * anonymous id; with neither it does nothing. Never throws: losing a backup
 * number must never block a sign-in.
 */
export async function recordPhoneAttempt(
  input: {
    userId?: string | null;
    anonymousId?: string | null;
    phone: string;
    event: PhoneAttemptEvent | PhoneAttemptSignal;
    source?: string | null;
    sourceApp?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    device?: string | null;
    browser?: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<boolean> {
  if (!input.userId && !input.anonymousId) return false;
  const params = {
    p_user_id: input.userId ?? null,
    p_anonymous_id: input.anonymousId ?? null,
    p_phone: input.phone,
    p_event: input.event,
    p_source: input.source ?? null,
    p_source_app: input.sourceApp ?? null,
    p_error_code: input.errorCode ? String(input.errorCode).slice(0, 80) : null,
    p_error_message: input.errorMessage ? String(input.errorMessage).slice(0, 300) : null,
  };
  try {
    let { error } = await db(client).rpc('record_phone_attempt', {
      ...params,
      p_device: input.device ? String(input.device).slice(0, 60) : null,
      p_browser: input.browser ? String(input.browser).slice(0, 60) : null,
    });
    // An environment still on the first version of the function (before
    // migration 20261211090100): keep saving status events, without the device.
    if (error?.code === 'PGRST202' && isPhoneAttemptEvent(input.event)) {
      ({ error } = await db(client).rpc('record_phone_attempt', params));
    }
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
 * sign-in whom staff can still call. A number some account later verified
 * drops off, and so does everyone who verified any other number (a
 * corrected typo). The view checks both tables.
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
  return attachUsers((data ?? []) as PhoneAttempt[], client);
}

async function attachUsers(rows: PhoneAttempt[], client?: TypedSupabaseClient): Promise<UnverifiedPhoneAttempt[]> {
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

/** Minutes without progress before someone counts as stuck (alert and badge). */
export const PHONE_STUCK_AFTER_MINUTES = 10;

/** The person a phone attempt belongs to: the account, else the visitor. */
export function phoneAttemptOwnerKey(a: Pick<PhoneAttempt, 'id' | 'user_id' | 'anonymous_id'>): string {
  return a.user_id ? `user:${a.user_id}` : `visitor:${a.anonymous_id ?? a.id}`;
}

function stuckWindow(now: Date, sinceMs: number) {
  return {
    since: new Date(now.getTime() - sinceMs).toISOString(),
    settled: new Date(now.getTime() - PHONE_STUCK_AFTER_MINUTES * 60 * 1000).toISOString(),
  };
}

/**
 * People stuck and still to call: an unverified number, no new Send OTP for
 * PHONE_STUCK_AFTER_MINUTES, tried within `days`, not marked done. The Admin
 * sidebar badge. Null when the count cannot be read.
 */
export async function countStuckPhonePeople(
  options: { days?: number; now?: Date } = {},
  client?: TypedSupabaseClient,
): Promise<number | null> {
  const { since, settled } = stuckWindow(options.now ?? new Date(), (options.days ?? 7) * 24 * 60 * 60 * 1000);
  try {
    const { data, error } = await db(client)
      .from('phone_attempts_unverified')
      .select('id, user_id, anonymous_id')
      .is('handled_at', null)
      .gte('last_attempt_at', since)
      .lte('last_attempt_at', settled)
      .limit(1000);
    if (error) return null;
    return new Set(((data ?? []) as PhoneAttempt[]).map(phoneAttemptOwnerKey)).size;
  } catch {
    return null;
  }
}

/**
 * Claim the numbers of people who got stuck within `hours` and were never
 * alerted. alerted_at is set by the same update (only where still null), so
 * two overlapping cron runs cannot alert twice.
 */
export async function claimStuckPhoneAttemptsForAlert(
  options: { hours?: number; now?: Date; limit?: number } = {},
  client?: TypedSupabaseClient,
): Promise<UnverifiedPhoneAttempt[]> {
  const now = options.now ?? new Date();
  const { since, settled } = stuckWindow(now, (options.hours ?? 24) * 60 * 60 * 1000);
  const { data, error } = await db(client)
    .from('phone_attempts_unverified')
    .select('id')
    .is('alerted_at', null)
    .is('handled_at', null)
    .gte('last_attempt_at', since)
    .lte('last_attempt_at', settled)
    .order('last_attempt_at', { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 50, 1), 200));
  if (error) throw error;
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (!ids.length) return [];

  const { data: claimed, error: claimError } = await db(client)
    .from('phone_attempts')
    .update({ alerted_at: now.toISOString() })
    .in('id', ids)
    .is('alerted_at', null)
    .select('*');
  if (claimError) throw claimError;
  return attachUsers((claimed ?? []) as PhoneAttempt[], client);
}

/**
 * Mark one person (an account, or a signed-out visitor) done, or back to
 * call. Applies to all their unverified numbers; their next Send OTP reopens
 * them. Returns how many numbers changed.
 */
export async function setStuckPhonePersonHandled(
  person: { userId?: string | null; anonymousId?: string | null },
  change: { done: boolean; by: string | null },
  client?: TypedSupabaseClient,
): Promise<number> {
  if (!person.userId && !person.anonymousId) return 0;
  let query = db(client)
    .from('phone_attempts')
    .update(change.done
      ? { handled_at: new Date().toISOString(), handled_by: change.by }
      : { handled_at: null, handled_by: null })
    .neq('status', 'verified');
  query = person.userId
    ? query.eq('user_id', person.userId)
    : query.is('user_id', null).eq('anonymous_id', person.anonymousId);
  const { data, error } = await query.select('id');
  if (error) throw error;
  return (data ?? []).length;
}
