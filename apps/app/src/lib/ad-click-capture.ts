/**
 * Keep the Google Ads click id when an ad lands straight on app.neramclasses.com.
 *
 * The marketing site already does this (apps/marketing/src/lib/attribution.ts)
 * and writes the `neram_attribution` cookie on .neramclasses.com. The app did
 * not, so an ad that pointed at an app page (a free tool, say) lost its gclid,
 * and the sign-up that followed could not be credited to the ad.
 *
 * This writes the same cookie, in the same shape, only when the URL carries
 * campaign parameters. /api/auth/register-user reads it (readFirstTouchCookie)
 * into users.first_touch, which the admin app's Google Ads agent uploads with
 * the OTP-verified sign-up. Keep the format in step with the marketing file.
 */

export const ATTRIBUTION_COOKIE = 'neram_attribution';
const MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
const MAX_VALUE_LENGTH = 100;

export const CAMPAIGN_KEYS = ['gclid', 'wbraid', 'gbraid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const INDIAN_MOBILE_PATTERN = /(?:^|\D)(?:\+?91[\s-]?)?[6-9]\d{9}(?:\D|$)/;

/** Trimmed and capped; null when empty or when it carries contact details. */
export function cleanValue(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim().slice(0, MAX_VALUE_LENGTH);
  if (!value) return null;
  if (EMAIL_PATTERN.test(value) || INDIAN_MOBILE_PATTERN.test(value)) return null;
  return value;
}

/** The record to store for this URL, or null when it has no campaign parameters (keep what is stored). */
export function campaignFromUrl(search: string, pathname: string, now = new Date()): Record<string, string> | null {
  const params = new URLSearchParams(search);
  const out: Record<string, string> = {};
  for (const key of CAMPAIGN_KEYS) {
    const v = cleanValue(params.get(key));
    if (v) out[key] = v;
  }
  if (!Object.keys(out).length) return null;
  // A new campaign replaces the previous one as a whole, as on the marketing site.
  return { ...out, landing_page: pathname, captured_at: now.toISOString() };
}

export function cookieString(record: Record<string, string>, hostname: string, https: boolean): string {
  const parts = [`${ATTRIBUTION_COOKIE}=${encodeURIComponent(JSON.stringify(record))}`, 'Path=/', `Max-Age=${MAX_AGE_SECONDS}`, 'SameSite=Lax'];
  if (hostname === 'neramclasses.com' || hostname.endsWith('.neramclasses.com')) parts.push('Domain=.neramclasses.com');
  if (https) parts.push('Secure');
  return parts.join('; ');
}

/** Browser only. Never throws: a blocked cookie must not break the page. */
export function captureAdClick(): void {
  if (typeof window === 'undefined') return;
  try {
    const record = campaignFromUrl(window.location.search, window.location.pathname);
    if (record) document.cookie = cookieString(record, window.location.hostname, window.location.protocol === 'https:');
  } catch {
    /* cookies blocked */
  }
}
