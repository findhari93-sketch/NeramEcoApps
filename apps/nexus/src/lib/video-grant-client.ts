/**
 * Browser side of the stream grant refresh.
 *
 * A proxied recording plays from a URL carrying a signed grant that lasts ten
 * minutes (lib/video-token.ts). Until this existed the player let it lapse, the
 * next byte range was refused, and the student watched a frozen picture until
 * a 20 second stall watchdog reloaded the stream: about 41 seconds lost every
 * ten minutes, 298 times in one month across 16 students.
 *
 * Now the player fetches a fresh grant before the old one runs out and POSTs it
 * to the stream URL, which stores it in a cookie. The <video> keeps requesting
 * the URL it started with, and the proxy serves those requests on the cookie
 * once the URL's own grant has lapsed. Nothing reloads and nothing freezes.
 *
 * Pure apart from fetch: no React, so the parsing is unit-testable.
 */

/** Seconds a grant was issued for, read from the URL without verifying it. */
export function grantTtlFromSrc(src: string | null | undefined): number | null {
  if (!src) return null;
  let token: string | null;
  try {
    token = new URL(src, 'https://nexus.invalid').searchParams.get('vt');
  } catch {
    return null;
  }
  if (!token || !token.startsWith('vid_')) return null;

  const body = token.slice(4).split('.')[0];
  if (!body) return null;
  try {
    const b64 = body.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    const ttl = Number(json?.exp) - Number(json?.iat);
    return Number.isFinite(ttl) && ttl > 0 ? ttl : null;
  } catch {
    return null;
  }
}

export interface ArmResult {
  /** The proxy accepted the grant and set the cookie. */
  armed: boolean;
  /** The request already carried a live cookie for this video. */
  cookie: boolean;
}

/** Store `src`'s grant in the proxy's cookie. Never throws. */
export async function armStreamGrant(src: string): Promise<ArmResult> {
  try {
    const res = await fetch(src, { method: 'POST', credentials: 'include', cache: 'no-store' });
    if (!res.ok) return { armed: false, cookie: false };
    const data = await res.json().catch(() => null);
    return { armed: data?.armed === true, cookie: data?.cookie === true };
  } catch {
    return { armed: false, cookie: false };
  }
}

/**
 * Arm a grant and confirm the browser really sends the cookie back.
 *
 * Setting a cookie is not the same as having it sent: Safari and some Teams
 * builds drop partitioned cookies in an iframe. The proxy reports whether a
 * request carried a live cookie, so a second POST straight after the first
 * proves it either way. Two requests only when the first could not tell, which
 * is the first arm of a page and an arm after a long pause.
 */
export async function armAndConfirm(src: string): Promise<boolean> {
  const first = await armStreamGrant(src);
  if (!first.armed) return false;
  if (first.cookie) return true;
  const second = await armStreamGrant(src);
  return second.armed && second.cookie;
}
