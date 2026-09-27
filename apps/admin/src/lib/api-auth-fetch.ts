/**
 * Attach the signed-in staff member's Microsoft token to every same-origin
 * `/api/` call the admin UI makes.
 *
 * The admin UI has ~346 `fetch('/api/...')` calls and none of them sent a token,
 * because no route checked one. Now middleware.ts does, so rather than edit every
 * call site, `window.fetch` is wrapped once. A call that already sets its own
 * Authorization header is left alone.
 */

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

/** Build a fetch that adds `Authorization: Bearer <token>` to admin API calls. */
export function createAuthedFetch(baseFetch: typeof fetch, getToken: TokenGetter, origin: string): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isAdminApiRequest(input, origin) || hasAuthorization(input, init)) {
      return baseFetch(input, init);
    }
    const token = await getToken().catch(() => null);
    if (!token) return baseFetch(input, init);

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('Authorization', `Bearer ${token}`);
    return baseFetch(input, { ...init, headers });
  };
}

let installed = false;

/** Wrap window.fetch once. Safe to call repeatedly and during SSR (no-op). */
export function installAdminApiAuth(getToken: TokenGetter): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const base = window.fetch.bind(window);
  window.fetch = createAuthedFetch(base, getToken, window.location.origin);
}
