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

const TOUCH_KEY = 'neram_touches';

export type Channel =
  | 'google_business'
  | 'google_organic'
  | 'bing_organic'
  | 'ai_chatgpt'
  | 'ai_perplexity'
  | 'ai_claude'
  | 'ai_gemini'
  | 'ai_copilot'
  | 'youtube'
  | 'google_ads'
  | 'meta_ads'
  | 'whatsapp'
  | 'direct'
  | 'referral'
  | 'other';

export interface Touch {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  landing_page: string;
  referrer: string | null;
  channel: Channel;
  ts: string;
}

export interface Touches {
  first: Touch | null;
  last: Touch | null;
}

const AI_HOSTS: Array<[RegExp, Channel]> = [
  [/(^|\.)chatgpt\.com$|(^|\.)openai\.com$/, 'ai_chatgpt'],
  [/(^|\.)perplexity\.ai$/, 'ai_perplexity'],
  [/(^|\.)claude\.ai$/, 'ai_claude'],
  [/^gemini\.google\.com$|^bard\.google\.com$/, 'ai_gemini'],
  [/^copilot\.microsoft\.com$/, 'ai_copilot'],
];

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True for our own sites, so internal navigation never counts as a touch. */
export function isOwnHost(host: string | null): boolean {
  return !!host && (host === 'neramclasses.com' || host.endsWith('.neramclasses.com') || host === 'localhost');
}

/**
 * Where a visit came from. Paid click ids and utm params win over the referrer;
 * AI assistants are matched by referrer host or by utm_source (ChatGPT adds
 * utm_source=chatgpt.com to links it cites).
 */
export function classifyChannel(input: {
  utm_source?: string | null;
  utm_medium?: string | null;
  gclid?: string | null;
  wbraid?: string | null;
  gbraid?: string | null;
  fbclid?: string | null;
  referrer?: string | null;
}): Channel {
  const source = (input.utm_source ?? '').toLowerCase();
  const medium = (input.utm_medium ?? '').toLowerCase();
  const host = hostOf(input.referrer);

  if (input.gclid || input.wbraid || input.gbraid || (source === 'google' && /cpc|ppc|paid/.test(medium))) return 'google_ads';
  if (input.fbclid || ((/facebook|instagram|meta|fb|ig/.test(source)) && /cpc|ppc|paid|ads?/.test(medium))) return 'meta_ads';

  // The "Website" link on a Google Business Profile carries utm_medium=gbp
  // (agents/seo-aeo/TN_CENTRE_PLAYBOOK.md): a lead from the map pack.
  if (/^(gbp|google_business|gmb)$/.test(medium)) return 'google_business';

  for (const [re, channel] of AI_HOSTS) {
    if ((host && re.test(host)) || (source && re.test(source.replace(/^https?:\/\//, '')))) return channel;
  }
  if (/^(chatgpt|openai)$/.test(source)) return 'ai_chatgpt';
  if (source === 'perplexity') return 'ai_perplexity';
  if (source === 'claude') return 'ai_claude';
  if (source === 'gemini') return 'ai_gemini';
  if (source === 'copilot') return 'ai_copilot';

  if (source.includes('whatsapp') || host === 'wa.me' || host?.endsWith('whatsapp.com')) return 'whatsapp';
  if (source.includes('youtube') || host === 'youtu.be' || host?.endsWith('youtube.com')) return 'youtube';
  if (source) return 'other';

  if (!host || isOwnHost(host)) return 'direct';
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return 'google_organic';
  if (/(^|\.)bing\.com$/.test(host)) return 'bing_organic';
  if (/(^|\.)(facebook|instagram)\.com$|^l\.facebook\.com$/.test(host)) return 'referral';
  return 'referral';
}

/** Pure: the next first/last pair for a page load, or null when it is not a new touch. */
export function nextTouches(
  prev: Touches,
  page: { search: string; pathname: string; referrer: string | null; now: string },
): Touches | null {
  const params = new URLSearchParams(page.search);
  const refHost = hostOf(page.referrer);
  const hasCampaign = ['utm_source', 'utm_medium', 'utm_campaign', 'gclid', 'wbraid', 'gbraid', 'fbclid'].some((k) => params.get(k));
  const external = !!refHost && !isOwnHost(refHost);
  // A first visit with no referrer is a direct touch; later direct loads are not new touches.
  if (!hasCampaign && !external && prev.first) return null;
  const touch: Touch = {
    source: cleanValue(params.get('utm_source')) ?? (external ? refHost : null),
    medium: cleanValue(params.get('utm_medium')) ?? (external ? 'referral' : null),
    campaign: cleanValue(params.get('utm_campaign')),
    landing_page: page.pathname,
    referrer: external ? `https://${refHost}` : null,
    channel: classifyChannel({
      utm_source: params.get('utm_source'),
      utm_medium: params.get('utm_medium'),
      gclid: params.get('gclid'),
      wbraid: params.get('wbraid'),
      gbraid: params.get('gbraid'),
      fbclid: params.get('fbclid'),
      referrer: external ? page.referrer : null,
    }),
    ts: page.now,
  };
  return { first: prev.first ?? touch, last: touch };
}

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
