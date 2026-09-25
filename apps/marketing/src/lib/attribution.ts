/**
 * Attribution capture for Google Ads + UTM.
 *
 * Reads gclid / wbraid / utm_* from the URL on first paint and persists them
 * so they survive page hops (landing → /apply, landing → inline form submit).
 * Lead-capture surfaces spread leadAttribution() into their POST body, so the
 * backend can attribute the conversion even when the form is on a different
 * page from the ad click.
 *
 * Stored twice: sessionStorage for this tab, and a first-party cookie on
 * .neramclasses.com (90 days) so the touch survives a new tab, a return visit
 * a few days later, and the hop to app.neramclasses.com.
 */

const STORAGE_KEY = 'neram_attribution';
const COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
const MAX_VALUE_LENGTH = 100;

export interface AttributionData {
  gclid?: string;
  wbraid?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  referral_code?: string;
  landing_page?: string;
  captured_at?: string;
}

/** The fields the lead tables store (callback_requests, nata_assistance_requests, lead_profiles). */
export type LeadAttribution = Pick<
  AttributionData,
  'utm_source' | 'utm_medium' | 'utm_campaign' | 'gclid' | 'wbraid'
>;

const CAMPAIGN_KEYS = [
  'gclid',
  'wbraid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;

const LEAD_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'gclid', 'wbraid'] as const;

const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const INDIAN_MOBILE_PATTERN = /(?:^|\D)(?:\+?91[\s-]?)?[6-9]\d{9}(?:\D|$)/;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

/** Root-domain cookie on production and staging hosts; host-only anywhere else. */
export function attributionCookieDomain(hostname: string): string | undefined {
  return hostname === 'neramclasses.com' || hostname.endsWith('.neramclasses.com')
    ? '.neramclasses.com'
    : undefined;
}

/** Trimmed and capped; null when the value is empty or carries contact details. */
function cleanValue(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim().slice(0, MAX_VALUE_LENGTH);
  if (!value) return null;
  if (EMAIL_PATTERN.test(value) || INDIAN_MOBILE_PATTERN.test(value)) return null;
  return value;
}

function readCookie(): AttributionData | null {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${STORAGE_KEY}=`));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match.slice(STORAGE_KEY.length + 1))) as AttributionData;
  } catch {
    return null;
  }
}

function writeCookie(data: AttributionData) {
  const domain = attributionCookieDomain(window.location.hostname);
  const parts = [
    `${STORAGE_KEY}=${encodeURIComponent(JSON.stringify(data))}`,
    'Path=/',
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
  ];
  if (domain) parts.push(`Domain=${domain}`);
  if (window.location.protocol === 'https:') parts.push('Secure');
  document.cookie = parts.join('; ');
}

export function getStoredAttribution(): AttributionData {
  if (!isBrowser()) return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AttributionData;
  } catch {
    // Unreadable session copy, fall back to the cookie
  }
  try {
    return readCookie() ?? {};
  } catch {
    return {};
  }
}

/** Only the stored lead fields that have a value, ready to spread into a POST body. */
export function leadAttribution(): LeadAttribution {
  const stored = getStoredAttribution();
  const out: LeadAttribution = {};
  for (const key of LEAD_KEYS) {
    if (stored[key]) out[key] = stored[key];
  }
  return out;
}

export function captureAttributionFromUrl(): AttributionData {
  if (!isBrowser()) return {};

  const params = new URLSearchParams(window.location.search);
  const existing = getStoredAttribution();

  const incoming: AttributionData = {};
  for (const key of CAMPAIGN_KEYS) {
    const value = cleanValue(params.get(key));
    if (value) incoming[key] = value;
  }

  // A new campaign replaces the previous one as a whole. Merging key by key
  // would pair a WhatsApp source with an old Google Ads campaign and gclid.
  // A page without campaign params leaves the stored touch alone.
  let next: AttributionData;
  if (Object.keys(incoming).length > 0) {
    next = {
      ...incoming,
      referral_code: existing.referral_code,
      landing_page: window.location.pathname,
      captured_at: new Date().toISOString(),
    };
  } else {
    next = { ...existing };
  }

  const ref = cleanValue(params.get('ref'));
  if (ref) next.referral_code = ref;
  if (!next.referral_code) delete next.referral_code;

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // sessionStorage full or unavailable, fail silently
  }
  if (Object.keys(incoming).length > 0 || ref) {
    try {
      writeCookie(next);
    } catch {
      // Cookies blocked, the session copy still covers this tab
    }
  }

  return next;
}
