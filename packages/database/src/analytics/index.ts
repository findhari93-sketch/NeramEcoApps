/**
 * First-party analytics contract, shared by every app. Browser-safe: no Supabase
 * client, no Node APIs. Import from '@neram/database/analytics'.
 *
 * Events are rows in user_funnel_events (exposed with the spec's column names as
 * the `analytics_events` view). New event names follow `object_action`; the
 * original auth names (google_auth_started, otp_verified...) are kept as they
 * are because the admin funnel chart and diagnostics read them.
 */

// ── Funnels ────────────────────────────────────────────────────────────────

/** Mirrors chk_funnel on user_funnel_events. A value outside it fails the insert. */
export const FUNNELS = [
  'auth',
  'onboarding',
  'application',
  'tool',
  'marketing',
  'enrollment',
  'feedback',
  'engagement',
] as const;
export type Funnel = (typeof FUNNELS)[number];

export const EVENT_STATUSES = ['started', 'completed', 'failed', 'skipped'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const SOURCE_APPS = ['app', 'marketing', 'nexus', 'admin'] as const;
export type SourceApp = (typeof SOURCE_APPS)[number];

// ── Taxonomy (object_action) ───────────────────────────────────────────────

/** Every new event name, with the funnel it belongs to. */
export const EVENT_TAXONOMY = {
  // Tools (AiArchitect)
  tool_opened: 'tool',
  tool_completed: 'tool',
  tool_failed: 'tool',
  // Marketing
  landing_page_viewed: 'marketing',
  course_page_viewed: 'marketing',
  tool_page_viewed: 'marketing',
  demo_requested: 'marketing',
  demo_window_picked: 'marketing',
  demo_details_done: 'marketing',
  demo_signin_started: 'marketing',
  demo_drawing_share_clicked: 'marketing',
  demo_parent_share_clicked: 'marketing',
  callback_requested: 'marketing',
  // Application and enrollment
  application_started: 'application',
  application_step_completed: 'application',
  autofill_selected: 'application',
  voice_started: 'application',
  voice_completed: 'application',
  document_upload_started: 'application',
  document_processed: 'application',
  manual_entry_started: 'application',
  course_selected: 'application',
  application_reviewed: 'application',
  application_completed: 'application',
  payment_started: 'enrollment',
  payment_completed: 'enrollment',
  payment_failed: 'enrollment',
  enrollment_created: 'enrollment',
  provisioning_step: 'enrollment',
  enrollment_completed: 'enrollment',
  onboarding_started: 'enrollment',
  onboarding_viewed: 'enrollment',
  // Feedback
  feedback_requested: 'feedback',
  feedback_submitted: 'feedback',
  review_consent_given: 'feedback',
  review_submitted: 'feedback',
  review_published: 'feedback',
  // Engagement
  nexus_signed_in: 'engagement',
  profile_completed: 'engagement',
} as const satisfies Record<string, Funnel>;

export type TaxonomyEvent = keyof typeof EVENT_TAXONOMY;

/** object_action: lowercase words joined by underscores, at least two parts. */
export const EVENT_NAME_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;

export function isValidEventName(name: unknown): name is string {
  return typeof name === 'string' && name.length <= 64 && EVENT_NAME_PATTERN.test(name);
}

// ── Anonymous id ───────────────────────────────────────────────────────────

/**
 * A random id stored in a first-party cookie on .neramclasses.com, so the
 * marketing site and the tools app share it. Deliberately NOT a device
 * fingerprint: many users are minors, and a random id can be cleared by the
 * user while a hardware hash cannot.
 */
export const ANON_ID_COOKIE = 'neram_anon_id';
export const ANON_ID_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const ANON_ID_PATTERN = /^anon_[0-9a-f]{32}$/;

export function isValidAnonymousId(value: unknown): value is string {
  return typeof value === 'string' && ANON_ID_PATTERN.test(value);
}

/** anon_ + 32 hex characters from a CSPRNG. */
export function newAnonymousId(randomBytes?: (n: number) => Uint8Array): string {
  const bytes = randomBytes
    ? randomBytes(16)
    : (() => {
        const b = new Uint8Array(16);
        globalThis.crypto.getRandomValues(b);
        return b;
      })();
  return `anon_${Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** Read a cookie from a `document.cookie`-style string. */
export function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** The cookie domain to share across subdomains; null on localhost / previews. */
export function sharedCookieDomain(hostname: string): string | null {
  return hostname === 'neramclasses.com' || hostname.endsWith('.neramclasses.com') ? '.neramclasses.com' : null;
}

/** A Set-Cookie / document.cookie value for the anonymous id. */
export function anonIdCookie(id: string, hostname: string, secure = true): string {
  const domain = sharedCookieDomain(hostname);
  return [
    `${ANON_ID_COOKIE}=${id}`,
    'Path=/',
    `Max-Age=${ANON_ID_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
    domain ? `Domain=${domain}` : null,
    secure ? 'Secure' : null,
  ]
    .filter(Boolean)
    .join('; ');
}

// ── Server-side normalisation ──────────────────────────────────────────────

export interface NormalizedFunnelEvent {
  user_id: string | null;
  anonymous_id: string | null;
  session_id: string | null;
  funnel: Funnel;
  event: string;
  status: EventStatus;
  error_message: string | null;
  error_code: string | null;
  metadata: Record<string, unknown>;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  ip_address: string | null;
  source_app: string;
  page_url: string | null;
  device_session_id: null;
}

const MAX_TEXT = 500;
const clip = (v: unknown, n = MAX_TEXT): string | null =>
  typeof v === 'string' && v.length > 0 ? v.slice(0, n) : null;

/**
 * Turn a client batch into rows that will pass the table's CHECKs.
 *
 * Invalid events are dropped one by one instead of failing the whole batch: a
 * single unknown funnel used to make Postgres reject every event in the request,
 * and the route still answered 200. The anonymous id is kept only when it is one
 * of ours or the legacy fingerprint (64 hex), never an arbitrary string.
 */
export function normalizeFunnelEvents(
  raw: unknown[],
  ctx: { userId: string | null; ip: string | null; sourceApp: SourceApp; allowClientSourceApp?: boolean },
): { rows: NormalizedFunnelEvent[]; dropped: number } {
  const rows: NormalizedFunnelEvent[] = [];
  let dropped = 0;
  for (const item of raw) {
    const e = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const funnel = e.funnel as Funnel;
    if (!FUNNELS.includes(funnel) || !isValidEventName(e.event)) {
      dropped++;
      continue;
    }
    const status = (EVENT_STATUSES as readonly string[]).includes(e.status as string)
      ? (e.status as EventStatus)
      : 'started';
    const anon =
      isValidAnonymousId(e.anonymous_id) || (typeof e.anonymous_id === 'string' && /^[0-9a-f]{64}$/.test(e.anonymous_id))
        ? (e.anonymous_id as string)
        : null;
    const clientSource = typeof e.source_app === 'string' && (SOURCE_APPS as readonly string[]).includes(e.source_app);
    rows.push({
      user_id: ctx.userId,
      anonymous_id: anon,
      session_id: clip(e.session_id, 64),
      funnel,
      event: e.event as string,
      status,
      error_message: clip(e.error_message),
      error_code: clip(e.error_code, 100),
      metadata: e.metadata && typeof e.metadata === 'object' && !Array.isArray(e.metadata) ? (e.metadata as Record<string, unknown>) : {},
      device_type: clip(e.device_type, 20),
      browser: clip(e.browser, 50),
      os: clip(e.os, 50),
      ip_address: ctx.ip,
      source_app: ctx.allowClientSourceApp && clientSource ? (e.source_app as string) : ctx.sourceApp,
      page_url: clip(e.page_url, 1000),
      device_session_id: null,
    });
  }
  return { rows, dropped };
}

// ── First touch ────────────────────────────────────────────────────────────

/** The attribution keys we keep on users.first_touch. Anything else is dropped. */
export const FIRST_TOUCH_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'wbraid',
  'gbraid',
  'referral_code',
  'landing_page',
  'referrer',
] as const;

export function sanitizeFirstTouch(input: unknown): Record<string, string> | null {
  if (!input || typeof input !== 'object') return null;
  const out: Record<string, string> = {};
  for (const key of FIRST_TOUCH_KEYS) {
    const v = (input as Record<string, unknown>)[key];
    if (typeof v === 'string' && v.trim()) out[key] = v.trim().slice(0, 300);
  }
  return Object.keys(out).length ? out : null;
}

// ── Browser helpers ────────────────────────────────────────────────────────

const SESSION_KEY = 'neram_session_id';

/**
 * The shared anonymous id, created on first use. Browser only; returns null on
 * the server or when cookies are unavailable, and never throws.
 */
export function getOrCreateAnonymousId(): string | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  try {
    const existing = readCookie(document.cookie, ANON_ID_COOKIE);
    if (isValidAnonymousId(existing)) return existing;
    const id = newAnonymousId();
    document.cookie = anonIdCookie(id, window.location.hostname, window.location.protocol === 'https:');
    return id;
  } catch {
    return null;
  }
}

/** One id per browser tab session (sessionStorage). Null when unavailable. */
export function getSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = newAnonymousId().replace('anon_', 'sess_');
    window.sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return null;
  }
}

// ── First touch from the attribution cookie ────────────────────────────────

/** Written by apps/marketing/src/lib/attribution.ts on .neramclasses.com. */
export const ATTRIBUTION_COOKIE = 'neram_attribution';

/** The sanitised first touch from a Cookie header or document.cookie string. */
export function readFirstTouchCookie(cookieHeader: string | null | undefined): Record<string, string> | null {
  const raw = readCookie(cookieHeader, ATTRIBUTION_COOKIE);
  if (!raw) return null;
  try {
    return sanitizeFirstTouch(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * What a sign-up call should send so the new account keeps its origin. Used by
 * callers that post to register-user from another origin (cookies are not sent
 * cross-origin). Browser only; empty object elsewhere.
 */
export function signupAttributionFields(): { anonymous_id?: string; first_touch?: Record<string, string> } {
  if (typeof document === 'undefined') return {};
  const out: { anonymous_id?: string; first_touch?: Record<string, string> } = {};
  const anon = getOrCreateAnonymousId();
  if (anon) out.anonymous_id = anon;
  const touch = readFirstTouchCookie(document.cookie);
  if (touch) out.first_touch = touch;
  return out;
}
