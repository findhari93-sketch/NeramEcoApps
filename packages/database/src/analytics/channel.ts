/**
 * Where a visit came from: the channel classifier and the first/last touch
 * record, shared by the marketing site, the app and the server.
 *
 * Browser-safe and pure (no document, no window): the callers read and write
 * the cookie. The marketing site re-exports these from src/lib/attribution.ts.
 *
 * The `neram_touches` cookie on .neramclasses.com holds { first, last }. Unlike
 * `neram_attribution` (written only for campaign links), it also records the
 * referrer, so organic Google, ChatGPT without a utm, other websites and direct
 * visits are told apart.
 */

export const TOUCH_COOKIE = 'neram_touches';

export const CHANNELS = [
  'google_business',
  'google_organic',
  'bing_organic',
  'ai_chatgpt',
  'ai_perplexity',
  'ai_claude',
  'ai_gemini',
  'ai_copilot',
  'youtube',
  'google_ads',
  'meta_ads',
  'whatsapp',
  'direct',
  'referral',
  'other',
] as const;

export type Channel = (typeof CHANNELS)[number];

export function isChannel(value: unknown): value is Channel {
  return typeof value === 'string' && (CHANNELS as readonly string[]).includes(value);
}

/** Staff-facing names. Admin "Leads by channel" uses the same words. */
export const CHANNEL_LABELS: Record<Channel | 'unknown', string> = {
  google_business: 'Google Maps (business profile)',
  google_organic: 'Google search',
  bing_organic: 'Bing search',
  ai_chatgpt: 'ChatGPT',
  ai_perplexity: 'Perplexity',
  ai_claude: 'Claude',
  ai_gemini: 'Gemini',
  ai_copilot: 'Copilot',
  youtube: 'YouTube',
  google_ads: 'Google Ads',
  meta_ads: 'Meta ads',
  whatsapp: 'WhatsApp',
  direct: 'Direct',
  referral: 'Other websites',
  other: 'Other campaigns',
  unknown: 'Not recorded',
};

export function channelLabel(channel: string | null | undefined): string {
  return isChannel(channel) ? CHANNEL_LABELS[channel] : CHANNEL_LABELS.unknown;
}

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

const MAX_VALUE_LENGTH = 100;
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const INDIAN_MOBILE_PATTERN = /(?:^|\D)(?:\+?91[\s-]?)?[6-9]\d{9}(?:\D|$)/;

/** Trimmed and capped; null when the value is empty or carries contact details. */
export function cleanTouchValue(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().slice(0, MAX_VALUE_LENGTH);
  if (!value) return null;
  if (EMAIL_PATTERN.test(value) || INDIAN_MOBILE_PATTERN.test(value)) return null;
  return value;
}

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
    source: cleanTouchValue(params.get('utm_source')) ?? (external ? refHost : null),
    medium: cleanTouchValue(params.get('utm_medium')) ?? (external ? 'referral' : null),
    campaign: cleanTouchValue(params.get('utm_campaign')),
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

/** The touches record from a raw cookie value or a JSON body field. Null when unreadable. */
export function parseTouches(raw: unknown): Touches | null {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const pick = (t: unknown): Touch | null => {
    if (!t || typeof t !== 'object') return null;
    const r = t as Record<string, unknown>;
    if (!isChannel(r.channel)) return null;
    const str = (v: unknown, max = 300) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
    return {
      source: str(r.source, MAX_VALUE_LENGTH),
      medium: str(r.medium, MAX_VALUE_LENGTH),
      campaign: str(r.campaign, MAX_VALUE_LENGTH),
      landing_page: str(r.landing_page) ?? '/',
      referrer: str(r.referrer),
      channel: r.channel,
      ts: str(r.ts, 40) ?? '',
    };
  };
  const v = value as Record<string, unknown>;
  const touches = { first: pick(v.first), last: pick(v.last) };
  return touches.first || touches.last ? touches : null;
}

/** A Set-Cookie style string for document.cookie (root domain on our hosts). */
export function touchesCookieString(touches: Touches, hostname: string, https: boolean): string {
  const parts = [
    `${TOUCH_COOKIE}=${encodeURIComponent(JSON.stringify(touches))}`,
    'Path=/',
    `Max-Age=${90 * 24 * 60 * 60}`,
    'SameSite=Lax',
  ];
  if (hostname === 'neramclasses.com' || hostname.endsWith('.neramclasses.com')) parts.push('Domain=.neramclasses.com');
  if (https) parts.push('Secure');
  return parts.join('; ');
}
