/**
 * Attribution capture for Google Ads + UTM.
 *
 * Reads gclid / wbraid / gbraid / utm_* from the URL on first paint and persists them
 * so they survive page hops (landing → /apply, landing → inline form submit).
 * Lead-capture surfaces spread leadAttribution() into their POST body, so the
 * backend can attribute the conversion even when the form is on a different
 * page from the ad click.
 *
 * Stored twice: sessionStorage for this tab, and a first-party cookie on
 * .neramclasses.com (90 days) so the touch survives a new tab, a return visit
 * a few days later, and the hop to app.neramclasses.com.
 */

import {
  classifyChannel,
  isOwnHost,
  nextTouches,
  TOUCH_COOKIE,
  type Channel,
  type Touch,
  type Touches,
} from '@neram/database/analytics';

const STORAGE_KEY = 'neram_attribution';
const COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
const MAX_VALUE_LENGTH = 100;

export interface AttributionData {
  gclid?: string;
  wbraid?: string;
  /** iOS app-to-web click id. Kept on the cookie (users.first_touch) only; the lead tables have no column for it. */
  gbraid?: string;
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
  'gbraid',
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

// ─── First and last touch, with the channel ──────────────────────────────────
//
// Separate from the campaign record above (which lead forms already send), so
// adding this never changes an existing POST body. A "touch" is a visit that
// arrives from outside the site or carries campaign params; moving between our
// own pages is not a touch. The first touch is never overwritten.

const TOUCH_KEY = TOUCH_COOKIE;

// The classifier and the touch record live in @neram/database/analytics so the
// app and the sign-up route classify a visit exactly as this site does.
export { classifyChannel, isOwnHost, nextTouches };
export type { Channel, Touch, Touches };

function readTouchCookie(): Touches | null {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${TOUCH_KEY}=`));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match.slice(TOUCH_KEY.length + 1))) as Touches;
  } catch {
    return null;
  }
}

export function getTouches(): Touches {
  if (!isBrowser()) return { first: null, last: null };
  try {
    return readTouchCookie() ?? { first: null, last: null };
  } catch {
    return { first: null, last: null };
  }
}

/** Call once per page load (AttributionCapture does). */
export function captureTouch(): Touches {
  if (!isBrowser()) return { first: null, last: null };
  const prev = getTouches();
  const next = nextTouches(prev, {
    search: window.location.search,
    pathname: window.location.pathname,
    referrer: document.referrer || null,
    now: new Date().toISOString(),
  });
  if (!next) return prev;
  try {
    const domain = attributionCookieDomain(window.location.hostname);
    const parts = [
      `${TOUCH_KEY}=${encodeURIComponent(JSON.stringify(next))}`,
      'Path=/',
      `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
      'SameSite=Lax',
    ];
    if (domain) parts.push(`Domain=${domain}`);
    if (window.location.protocol === 'https:') parts.push('Secure');
    document.cookie = parts.join('; ');
  } catch {
    // Cookies blocked: attribution falls back to the campaign record
  }
  return next;
}

/** The channel of the latest touch, for event metadata. */
export function currentChannel(): Channel {
  return getTouches().last?.channel ?? 'direct';
}

/** Fields the lead APIs store with every lead (first_touch, last_touch, channel, landing_page). */
export function touchAttribution(pageCode?: string): {
  first_touch: Touch | null;
  last_touch: Touch | null;
  channel: Channel;
  landing_page: string | null;
  page_code: string | null;
} {
  const t = getTouches();
  return {
    first_touch: t.first,
    last_touch: t.last,
    channel: t.last?.channel ?? 'direct',
    landing_page: t.first?.landing_page ?? null,
    page_code: pageCode ?? null,
  };
}
