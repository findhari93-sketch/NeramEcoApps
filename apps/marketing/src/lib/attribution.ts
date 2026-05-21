/**
 * Attribution capture for Google Ads + UTM.
 *
 * Reads gclid / wbraid / utm_* from the URL on first paint and persists them
 * to sessionStorage so they survive page hops (landing → /apply, landing →
 * inline form submit). Lead-capture surfaces read back via getStoredAttribution()
 * and include the values in their POST body, so the backend can attribute the
 * conversion even when the form is on a different page from the ad click.
 */

const STORAGE_KEY = 'neram_attribution';

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

const ATTRIBUTION_KEYS = [
  'gclid',
  'wbraid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function getStoredAttribution(): AttributionData {
  if (!isBrowser()) return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as AttributionData;
  } catch {
    return {};
  }
}

export function captureAttributionFromUrl(): AttributionData {
  if (!isBrowser()) return {};

  const params = new URLSearchParams(window.location.search);
  const existing = getStoredAttribution();
  const next: AttributionData = { ...existing };

  for (const key of ATTRIBUTION_KEYS) {
    const value = params.get(key);
    // URL params overwrite stored values only when present and non-empty.
    // This means a later page-load without ad params won't clobber the first
    // captured attribution, which is the desired behaviour.
    if (value) {
      next[key] = value;
    }
  }

  const ref = params.get('ref');
  if (ref) next.referral_code = ref;

  if (!next.captured_at && (next.gclid || next.wbraid || next.utm_source)) {
    next.captured_at = new Date().toISOString();
    next.landing_page = window.location.pathname;
  }

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // sessionStorage full or unavailable, fail silently
  }

  return next;
}
