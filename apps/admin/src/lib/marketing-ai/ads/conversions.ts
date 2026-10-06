/**
 * Offline conversions: tell Google Ads which ad clicks became sign-ups.
 *
 * Neram's conversion is an OTP-verified sign-up: a person signs in to the app
 * and verifies their phone, and from then on the team can call them. That
 * happens in the app, behind Firebase, where Google's page tag never sees it
 * reliably. Uploading it here lets Smart Bidding bid for people like the ones
 * who actually verify a phone, not for page views or form starts.
 *
 *   phone_verified  GOOGLE_ADS_CONV_ACTION_PHONE  the primary conversion
 *   demo_booked     GOOGLE_ADS_CONV_ACTION_DEMO   secondary, reporting only
 *   admission_paid  GOOGLE_ADS_CONV_ACTION_PAID   secondary, valued at the fee
 *
 * Each upload carries whatever can identify the click:
 *  - the click id kept on users.first_touch (gclid, else wbraid, else gbraid),
 *    when the click is under 90 days old, and
 *  - SHA-256 of the phone (E.164) and of the email: Google's "enhanced
 *    conversions for leads", which credits sign-ups with no stored click id.
 * Raw phone numbers and emails never leave this process.
 *
 * Without MARKETING_AI_ALLOW_MUTATIONS the upload is validate-only and recorded
 * as 'validated', so it is sent for real later. Staging never has that flag,
 * and its test users can only ever be dry-run.
 */

import { createHash } from 'crypto';
import type { AdsEnv } from '../config';
import type { AdsClient, ClickConversion } from './client';

export type ConversionType = 'phone_verified' | 'demo_booked' | 'admission_paid';

export interface UserForConversion {
  id: string;
  email: string | null;
  phone: string | null;
  phone_verified: boolean | null;
  user_type: string | null;
  first_touch: Record<string, string> | null;
  first_touch_at: string | null;
  created_at: string;
}

export interface ConversionEvent {
  user_id: string;
  type: ConversionType;
  at: string; // ISO
  value_inr: number | null;
  order_id: string;
}

export interface ConversionCandidate {
  user_id: string;
  conversion_type: ConversionType;
  click_id_type: 'gclid' | 'gbraid' | 'wbraid' | 'none';
  click_id: string | null;
  matched_by: string[];
  hashed_phone: string | null;
  hashed_email: string | null;
  conversion_time: string;
  value_inr: number | null;
  order_id: string;
}

const CLICK_WINDOW_DAYS = 90;
const DAY = 86_400_000;
const STAFF = new Set(['admin', 'teacher']);

export const sha256Hex = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/**
 * Indian numbers to E.164. The OTP path stores +91XXXXXXXXXX, but older rows
 * hold bare 10-digit or 91-prefixed numbers. Anything that is not a plausible
 * number returns null rather than a hash Google could never match.
 */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  return null;
}

/** Google's normalisation for hashed emails: trimmed, lower case, and no dots in a gmail.com local part. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const e = raw.trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1 || at === e.length - 1) return null;
  let local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

/** Staff and synthetic test accounts are never uploaded. */
export function isRealProspect(u: UserForConversion): boolean {
  if (u.user_type && STAFF.has(u.user_type)) return false;
  const email = (u.email || '').toLowerCase();
  if (email.startsWith('e2e') || email.includes('e2etesting')) return false;
  return true;
}

/** Pure: which conversions are due. `done` holds "userId:type" pairs already uploaded or skipped. */
export function selectConversions(users: UserForConversion[], events: ConversionEvent[], done: Set<string>, now = new Date()): ConversionCandidate[] {
  const byId = new Map(users.map((u) => [u.id, u]));
  const out: ConversionCandidate[] = [];
  const seen = new Set<string>();

  for (const e of [...events].sort((a, b) => a.at.localeCompare(b.at))) {
    const key = `${e.user_id}:${e.type}`;
    if (done.has(key) || seen.has(key)) continue;
    const u = byId.get(e.user_id);
    if (!u || !isRealProspect(u)) continue;
    const at = new Date(e.at).getTime();
    if (!(at <= now.getTime()) || now.getTime() - at > CLICK_WINDOW_DAYS * DAY) continue;
    seen.add(key);

    // The stored click id counts only if the click was recent enough for Google to accept it.
    const ft = u.first_touch || {};
    const clickAt = u.first_touch_at ? new Date(u.first_touch_at).getTime() : at;
    const clickFresh = at - clickAt < CLICK_WINDOW_DAYS * DAY;
    const click = clickFresh ? (ft.gclid ? ['gclid', ft.gclid] : ft.wbraid ? ['wbraid', ft.wbraid] : ft.gbraid ? ['gbraid', ft.gbraid] : null) : null;

    const phone = normalizePhoneE164(u.phone);
    const email = normalizeEmail(u.email);
    const matched_by = [click && 'click_id', phone && 'phone', email && 'email'].filter(Boolean) as string[];
    if (!matched_by.length) continue;

    out.push({
      user_id: u.id,
      conversion_type: e.type,
      click_id_type: (click?.[0] as ConversionCandidate['click_id_type']) ?? 'none',
      click_id: click?.[1] ?? null,
      matched_by,
      hashed_phone: phone ? sha256Hex(phone) : null,
      hashed_email: email ? sha256Hex(email) : null,
      conversion_time: e.at,
      value_inr: e.value_inr,
      order_id: e.order_id,
    });
  }
  return out;
}

/** Google wants 'yyyy-mm-dd hh:mm:ss+05:30'. Neram reports in IST. */
export function toAdsDateTime(iso: string): string {
  const ist = new Date(new Date(iso).getTime() + 5.5 * 3600_000);
  return `${ist.toISOString().slice(0, 19).replace('T', ' ')}+05:30`;
}

const ACTION_ENV: Record<ConversionType, keyof AdsEnv> = {
  phone_verified: 'conversionActionPhone',
  demo_booked: 'conversionActionDemo',
  admission_paid: 'conversionActionPaid',
};

export function toClickConversion(c: ConversionCandidate, env: AdsEnv): ClickConversion | null {
  const actionId = env[ACTION_ENV[c.conversion_type]] as string;
  if (!actionId) return null;
  const userIdentifiers = [
    ...(c.hashed_phone ? [{ hashedPhoneNumber: c.hashed_phone }] : []),
    ...(c.hashed_email ? [{ hashedEmail: c.hashed_email }] : []),
  ];
  return {
    ...(c.click_id_type === 'gclid' ? { gclid: c.click_id! } : c.click_id_type === 'wbraid' ? { wbraid: c.click_id! } : c.click_id_type === 'gbraid' ? { gbraid: c.click_id! } : {}),
    ...(userIdentifiers.length ? { userIdentifiers } : {}),
    conversionAction: `customers/${env.customerId}/conversionActions/${actionId}`,
    conversionDateTime: toAdsDateTime(c.conversion_time),
    ...(c.value_inr !== null ? { conversionValue: c.value_inr, currencyCode: 'INR' } : {}),
    orderId: c.order_id,
  };
}

/** Indexes of conversions Google rejected in a partial-failure reply, with the reason. */
export function failedIndexes(partialFailureError: any): Map<number, string> {
  const out = new Map<number, string>();
  for (const detail of partialFailureError?.details ?? []) {
    for (const e of detail?.errors ?? []) {
      const path = e?.location?.fieldPathElements ?? [];
      const idx = path.find((p: any) => p?.fieldName === 'conversions')?.index;
      if (typeof idx === 'number') out.set(idx, e?.message || 'rejected');
    }
  }
  return out;
}

const chunks = <T,>(list: T[], n: number) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

/** Every conversion event of the last 90 days, from the database. */
export async function loadConversionEvents(db: any, now = new Date()): Promise<ConversionEvent[]> {
  const since = new Date(now.getTime() - CLICK_WINDOW_DAYS * DAY).toISOString();
  const events: ConversionEvent[] = [];

  // OTP verified in the app logs a funnel event with the time it happened.
  const { data: otp, error: oe } = await db.from('user_funnel_events').select('user_id, created_at').eq('event', 'otp_verified').not('user_id', 'is', null).gte('created_at', since).limit(10000);
  if (oe) throw new Error(`user_funnel_events: ${oe.message}`);
  for (const r of otp ?? []) events.push({ user_id: r.user_id, type: 'phone_verified', at: r.created_at, value_inr: null, order_id: `otp-${r.user_id}` });

  // Phone-first sign-ups (and the marketing EnrollWizard path) verify without that event: use account creation.
  const { data: phoneFirst, error: pe } = await db.from('users').select('id, created_at').eq('phone_verified', true).gte('created_at', since).limit(10000);
  if (pe) throw new Error(`users: ${pe.message}`);
  for (const r of phoneFirst ?? []) events.push({ user_id: r.id, type: 'phone_verified', at: r.created_at, value_inr: null, order_id: `otp-${r.id}` });

  const { data: demos, error: de } = await db.from('demo_class_registrations').select('id, user_id, created_at').not('user_id', 'is', null).gte('created_at', since).limit(10000);
  if (de) throw new Error(`demo_class_registrations: ${de.message}`);
  for (const r of demos ?? []) events.push({ user_id: r.user_id, type: 'demo_booked', at: r.created_at, value_inr: null, order_id: `demo-${r.id}` });

  const { data: pays, error: ye } = await db.from('payments').select('id, user_id, amount, verified_at, updated_at, created_at').eq('status', 'paid').not('user_id', 'is', null).gte('created_at', since).limit(10000);
  if (ye) throw new Error(`payments: ${ye.message}`);
  const paidByUser = new Map<string, { at: string; value: number; id: string }>();
  for (const p of pays ?? []) {
    const at = p.verified_at || p.updated_at || p.created_at;
    const prev = paidByUser.get(p.user_id);
    paidByUser.set(p.user_id, prev ? { at: prev.at < at ? prev.at : at, value: prev.value + Number(p.amount || 0), id: prev.at < at ? prev.id : p.id } : { at, value: Number(p.amount || 0), id: p.id });
  }
  for (const [user_id, p] of paidByUser) events.push({ user_id, type: 'admission_paid', at: p.at, value_inr: p.value, order_id: `paid-${p.id}` });

  return events;
}

export interface UploadStats {
  candidates: number;
  uploaded: number;
  validated: number;
  failed: number;
  not_configured: number;
  by_type: Record<string, number>;
  with_click_id: number;
  validate_only: boolean;
}

/** Load, select, upload and record. Writes ads_conversion_uploads; never touches campaigns. */
export async function uploadConversions(db: any, ads: AdsClient, env: AdsEnv, runId: string | null, now = new Date()): Promise<UploadStats> {
  const events = await loadConversionEvents(db, now);
  const userIds = [...new Set(events.map((e) => e.user_id))];

  const users: UserForConversion[] = [];
  const done = new Set<string>();
  for (const ids of chunks(userIds, 100)) {
    const { data, error } = await db.from('users').select('id, email, phone, phone_verified, user_type, first_touch, first_touch_at, created_at').in('id', ids);
    if (error) throw new Error(`users: ${error.message}`);
    users.push(...(data ?? []));
    const { data: up, error: ue } = await db.from('ads_conversion_uploads').select('user_id, conversion_type, status').in('user_id', ids).in('status', ['uploaded', 'skipped']);
    if (ue) throw new Error(`ads_conversion_uploads: ${ue.message}`);
    for (const u of up ?? []) done.add(`${u.user_id}:${u.conversion_type}`);
  }

  // A phone_verified event only counts if the user is still verified.
  const verified = new Set(users.filter((u) => u.phone_verified).map((u) => u.id));
  const relevant = events.filter((e) => e.type !== 'phone_verified' || verified.has(e.user_id));

  const candidates = selectConversions(users, relevant, done, now);
  const validateOnly = !env.allowMutations || ads.mode === 'mock';
  const stats: UploadStats = { candidates: candidates.length, uploaded: 0, validated: 0, failed: 0, not_configured: 0, by_type: {}, with_click_id: 0, validate_only: validateOnly };

  const ready: Array<{ c: ConversionCandidate; cc: ClickConversion }> = [];
  for (const c of candidates) {
    const cc = toClickConversion(c, env);
    if (!cc) {
      stats.not_configured++;
      continue;
    }
    ready.push({ c, cc });
    stats.by_type[c.conversion_type] = (stats.by_type[c.conversion_type] ?? 0) + 1;
    if (c.click_id) stats.with_click_id++;
  }

  for (const batch of chunks(ready, 200)) {
    let failures = new Map<number, string>();
    let batchError: string | null = null;
    let response: unknown = null;
    try {
      const res = await ads.uploadClickConversions(batch.map((b) => b.cc), { validateOnly });
      failures = failedIndexes(res.partialFailureError);
      response = { results: res.results.length };
    } catch (err: any) {
      batchError = err?.message || 'upload failed';
    }
    const rows = batch.map(({ c }, idx) => {
      const failed = batchError ?? failures.get(idx) ?? null;
      const status = failed ? 'failed' : validateOnly ? 'validated' : 'uploaded';
      if (status === 'failed') stats.failed++;
      else if (status === 'validated') stats.validated++;
      else stats.uploaded++;
      return {
        user_id: c.user_id,
        conversion_type: c.conversion_type,
        click_id_type: c.click_id_type,
        click_id: c.click_id,
        matched_by: c.matched_by,
        conversion_time: c.conversion_time,
        value_inr: c.value_inr,
        order_id: c.order_id,
        status,
        error: failed,
        google_response: response,
        run_id: runId,
        uploaded_at: status === 'uploaded' ? new Date().toISOString() : null,
      };
    });
    const { error } = await db.from('ads_conversion_uploads').upsert(rows, { onConflict: 'user_id,conversion_type' });
    if (error) throw new Error(`ads_conversion_uploads upsert: ${error.message}`);
  }
  return stats;
}
