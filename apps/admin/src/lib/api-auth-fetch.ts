/**
 * Attach the signed-in staff member's Microsoft token to every same-origin
 * `/api/` call the admin UI makes.
 *
 * The admin UI has ~346 `fetch('/api/...')` calls and none of them sent a token,
 * because no route checked one. Now middleware.ts does, so rather than edit every
 * call site, `window.fetch` is wrapped once. A call that already sets its own
 * Authorization header is left alone.
 *
 * When no token can be had silently (the Microsoft refresh token is about 24
 * hours old, or the browser blocks the hidden renewal frame), the call used to
 * go out with no token and the page showed "Sign in again: no Microsoft token
 * was sent." with no way to do so, losing whatever was being saved. Now the
 * wrapper asks `reauth` (the Sign in again dialog), waits, and sends the call
 * with the fresh token, so the user's click still lands.
 */

import { REAUTH_HEADER } from './admin-api-auth';

export type TokenGetter = () => Promise<string | null>;

/** True for a same-origin request to /api/ (relative or absolute). */
export function isAdminApiRequest(input: RequestInfo | URL, origin: string): boolean {
  let raw: string;
  if (typeof input === 'string') raw = input;
  else if (input instanceof URL) raw = input.href;
  else raw = input.url;
  try {
    const url = new URL(raw, origin);
    return url.origin === origin && (url.pathname === '/api' || url.pathname.startsWith('/api/'));
  } catch {
    return false;
  }
}

function hasAuthorization(input: RequestInfo | URL, init?: RequestInit): boolean {
  if (init?.headers && new Headers(init.headers).has('authorization')) return true;
  if (typeof Request !== 'undefined' && input instanceof Request && input.headers.has('authorization')) return true;
  return false;
}

/** A body that can be sent a second time. Streams are read once. */
function canReplay(input: RequestInfo | URL, init?: RequestInit): boolean {
  if (typeof Request !== 'undefined' && input instanceof Request) return false;
  if (typeof ReadableStream !== 'undefined' && init?.body instanceof ReadableStream) return false;
  return true;
}

function withToken(input: RequestInfo | URL, init: RequestInit | undefined, token: string): RequestInit {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
}

/**
 * Build a fetch that adds `Authorization: Bearer <token>` to admin API calls.
 * With `reauth`, a missing token or a middleware 401 about the token asks the
 * user to sign in again and sends the call once more with the new token.
 */
export function createAuthedFetch(
  baseFetch: typeof fetch,
  getToken: TokenGetter,
  origin: string,
  reauth?: TokenGetter,
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isAdminApiRequest(input, origin) || hasAuthorization(input, init)) {
      return baseFetch(input, init);
    }
    let token = await getToken().catch(() => null);
    if (!token && reauth) token = await reauth().catch(() => null);
    if (!token) return baseFetch(input, init);

    const res = await baseFetch(input, withToken(input, init, token));
    if (res.status !== 401 || !reauth || !res.headers.get(REAUTH_HEADER) || !canReplay(input, init)) {
      return res;
    }
    const fresh = await reauth().catch(() => null);
    if (!fresh || fresh === token) return res;
    return baseFetch(input, withToken(input, init, fresh));
  };
}

let installed = false;

/** Wrap window.fetch once. Safe to call repeatedly and during SSR (no-op). */
export function installAdminApiAuth(getToken: TokenGetter, reauth?: TokenGetter): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const base = window.fetch.bind(window);
  window.fetch = createAuthedFetch(base, getToken, window.location.origin, reauth);
}
