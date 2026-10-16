/**
 * Who is chatting with Aintra, read on the server from what the browser
 * already sends: the neram_anon_id cookie (one visitor across visits), the
 * neram_touches cookie (where the visit came from) and the user agent (the
 * device). Nothing new is collected on the client and the IP is never kept.
 *
 * A visitor who has not fired a funnel event yet has no neram_anon_id; the chat
 * mints one and the route sets it, so their next visit links to this one.
 */
import {
  ANON_ID_COOKIE,
  TOUCH_COOKIE,
  anonIdCookie,
  isChannel,
  isValidAnonymousId,
  newAnonymousId,
  readCookie,
} from '@neram/database/analytics';

export interface ChatVisitor {
  anonymousId: string;
  /** True when the cookie was missing and this id is new; set it on the response. */
  minted: boolean;
  channel: string | null;
  landingPage: string | null;
  device: string | null;
}

const OS_RULES: [RegExp, string][] = [
  [/iPhone|iPod/i, 'iPhone'],
  [/iPad/i, 'iPad'],
  [/Android/i, 'Android'],
  [/Windows/i, 'Windows'],
  [/CrOS/i, 'Chromebook'],
  [/Macintosh|Mac OS X/i, 'Mac'],
  [/Linux/i, 'Linux'],
];

// Order matters: Edge and Opera also say "Chrome", Chrome also says "Safari".
const BROWSER_RULES: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//i, 'Edge'],
  [/OPR\/|Opera/i, 'Opera'],
  [/SamsungBrowser/i, 'Samsung Internet'],
  [/FBAN|FBAV|Instagram/i, 'In-app browser'],
  [/CriOS|Chrome\//i, 'Chrome'],
  [/FxiOS|Firefox\//i, 'Firefox'],
  [/Safari\//i, 'Safari'],
];

/** "Android · Chrome", "iPhone · Safari", or null for an unknown agent. */
export function deviceFromUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const os = OS_RULES.find(([re]) => re.test(ua))?.[1] ?? null;
  const browser = BROWSER_RULES.find(([re]) => re.test(ua))?.[1] ?? null;
  if (!os && !browser) return null;
  return [os, browser].filter(Boolean).join(' · ');
}

function touchesFrom(cookieHeader: string | null): { channel: string | null; landingPage: string | null } {
  const raw = readCookie(cookieHeader, TOUCH_COOKIE);
  if (!raw) return { channel: null, landingPage: null };
  try {
    const t = JSON.parse(raw) as { first?: { landing_page?: unknown } | null; last?: { channel?: unknown } | null };
    const channel = isChannel(t.last?.channel) ? t.last!.channel : null;
    const landing = typeof t.first?.landing_page === 'string' ? t.first.landing_page.slice(0, 300) : null;
    return { channel: channel as string | null, landingPage: landing };
  } catch {
    return { channel: null, landingPage: null };
  }
}

export function chatVisitorFromHeaders(headers: { get(name: string): string | null }, mint: () => string = newAnonymousId): ChatVisitor {
  const cookieHeader = headers.get('cookie');
  const existing = readCookie(cookieHeader, ANON_ID_COOKIE);
  const valid = isValidAnonymousId(existing);
  return {
    anonymousId: valid ? (existing as string) : mint(),
    minted: !valid,
    ...touchesFrom(cookieHeader),
    device: deviceFromUserAgent(headers.get('user-agent')),
  };
}

/** Set-Cookie value for a freshly minted visitor id, shared across neramclasses.com. */
export function visitorCookie(anonymousId: string, requestUrl: string): string {
  const url = new URL(requestUrl);
  return anonIdCookie(anonymousId, url.hostname, url.protocol === 'https:');
}
