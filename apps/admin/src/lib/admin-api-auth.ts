/**
 * One door for the admin API: who is calling, and are they staff?
 *
 * Before this, 224 of the 225 admin routes trusted the caller completely: the
 * acting admin came from `adminId` in the request body and nothing checked a
 * token. `middleware.ts` now runs `resolveAdminCaller` on every `/api/*`
 * request, then stamps the verified `users.id` on the forwarded request as
 * `ADMIN_ID_HEADER`, which routes read with `getRequestAdminId`.
 *
 * Edge-safe on purpose: plain `fetch` to Graph and PostgREST, no Node APIs, no
 * `@neram/database` import (that would pull the Node Supabase client into the
 * edge bundle). Every dependency is injected, so the whole decision is unit
 * tested without a network.
 */

export const ADMIN_ID_HEADER = 'x-neram-admin-id';
export const ADMIN_TYPE_HEADER = 'x-neram-admin-type';

/** Who may use the admin API. Mirrors the check in /api/auth/me. */
export const STAFF_USER_TYPES = ['admin', 'teacher'] as const;

export type AdminCaller =
  | { ok: true; userId: string; userType: string; via: 'graph' | 'test' | 'cache' }
  | { ok: false; status: 401 | 403 | 500; error: string };

export interface AdminAuthDeps {
  fetch: typeof fetch;
  supabaseUrl: string;
  serviceKey: string;
  /** Accept `test_<base64 email>` tokens. Never true in production. */
  allowTestTokens: boolean;
  now?: () => number;
  cache?: AdminCallerCache;
}

interface UserRow {
  id: string;
  user_type: string | null;
  email: string | null;
  ms_oid: string | null;
}

/** Paths that must not require a staff token. Each guards itself. */
export function isExemptApiPath(pathname: string): boolean {
  // /api/auth/me verifies the token itself and is how the UI learns who it is.
  if (pathname === '/api/auth/me') return true;
  // Scheduled jobs authenticate with CRON_SECRET inside the route.
  if (pathname === '/api/cron' || pathname.startsWith('/api/cron/')) return true;
  return false;
}

export function extractBearer(authHeader: string | null | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

/** PostgREST `ilike` pattern for an exact, case-insensitive email match. */
export function exactIlikePattern(email: string): string {
  return email.replace(/([\\%_*])/g, '\\$1');
}

function decodeTestToken(token: string): string | null {
  try {
    const raw = token.slice('test_'.length);
    const email =
      typeof atob === 'function'
        ? atob(raw)
        : // Vitest in node: atob exists on Node 16+, this is only a fallback.
          Buffer.from(raw, 'base64').toString('utf8');
    return email.includes('@') ? email : null;
  } catch {
    return null;
  }
}

async function selectUsers(deps: AdminAuthDeps, filter: string): Promise<UserRow[] | 'error'> {
  const url = `${deps.supabaseUrl.replace(/\/$/, '')}/rest/v1/users?select=id,user_type,email,ms_oid&${filter}&limit=2`;
  try {
    const res = await deps.fetch(url, {
      headers: {
        apikey: deps.serviceKey,
        Authorization: `Bearer ${deps.serviceKey}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return 'error';
    return (await res.json()) as UserRow[];
  } catch {
    return 'error';
  }
}

function decide(row: UserRow | undefined, via: 'graph' | 'test'): AdminCaller {
  if (!row) {
    return {
      ok: false,
      status: 403,
      error: 'Your Microsoft account is not set up for the admin dashboard.',
    };
  }
  if (!row.user_type || !(STAFF_USER_TYPES as readonly string[]).includes(row.user_type)) {
    return { ok: false, status: 403, error: 'This account does not have access to the admin API.' };
  }
  return { ok: true, userId: row.id, userType: row.user_type, via };
}

/**
 * Resolve the caller behind an Authorization header.
 *
 * Order, matching /api/auth/me: Graph `/me` proves the token, then the users row
 * by `ms_oid`, then by the token's own email (case-insensitive, because Entra
 * keeps admin-set UPN casing). Never creates a user and never writes.
 */
export async function resolveAdminCaller(
  authHeader: string | null | undefined,
  deps: AdminAuthDeps,
): Promise<AdminCaller> {
  const token = extractBearer(authHeader);
  if (!token) return { ok: false, status: 401, error: 'Sign in again: no Microsoft token was sent.' };

  const now = deps.now ?? Date.now;
  const cached = deps.cache?.get(token, now());
  if (cached) return { ok: true, userId: cached.userId, userType: cached.userType, via: 'cache' };

  let result: AdminCaller;

  if (token.startsWith('test_') && deps.allowTestTokens) {
    const email = decodeTestToken(token);
    if (!email) return { ok: false, status: 401, error: 'Malformed test token.' };
    const rows = await selectUsers(deps, `email=ilike.${encodeURIComponent(exactIlikePattern(email))}`);
    if (rows === 'error') return { ok: false, status: 500, error: 'Could not check the admin account.' };
    result = decide(rows[0], 'test');
  } else {
    let profile: { id?: string; userPrincipalName?: string; mail?: string };
    try {
      const res = await deps.fetch('https://graph.microsoft.com/v1.0/me?$select=id,userPrincipalName,mail', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { ok: false, status: 401, error: 'Sign in again: the Microsoft token was not accepted.' };
      profile = await res.json();
    } catch {
      return { ok: false, status: 500, error: 'Could not reach Microsoft to check the sign-in.' };
    }
    if (!profile.id) return { ok: false, status: 401, error: 'Sign in again: the Microsoft token has no user.' };

    const byOid = await selectUsers(deps, `ms_oid=eq.${encodeURIComponent(profile.id)}`);
    if (byOid === 'error') return { ok: false, status: 500, error: 'Could not check the admin account.' };
    let row = byOid[0];

    const email = profile.userPrincipalName || profile.mail || '';
    if (!row && email) {
      const byEmail = await selectUsers(deps, `email=ilike.${encodeURIComponent(exactIlikePattern(email))}`);
      if (byEmail === 'error') return { ok: false, status: 500, error: 'Could not check the admin account.' };
      // Two rows for one address is a duplicate the merge queue must resolve;
      // refuse rather than guess which person is calling.
      if (byEmail.length > 1) {
        return { ok: false, status: 403, error: 'Two accounts share this email. Ask an administrator to merge them.' };
      }
      row = byEmail[0];
    }
    result = decide(row, 'graph');
  }

  if (result.ok) deps.cache?.set(token, { userId: result.userId, userType: result.userType }, now());
  return result;
}

/**
 * Small per-instance cache so a burst of admin requests costs one Graph call.
 * Keyed by the raw token, held in memory only, never logged. Short TTL so a
 * demoted staff member loses access within minutes, not an hour.
 */
export class AdminCallerCache {
  private entries = new Map<string, { userId: string; userType: string; expires: number }>();

  constructor(
    private readonly ttlMs = 5 * 60 * 1000,
    private readonly maxEntries = 200,
  ) {}

  get(token: string, now: number): { userId: string; userType: string } | null {
    const hit = this.entries.get(token);
    if (!hit) return null;
    if (hit.expires <= now) {
      this.entries.delete(token);
      return null;
    }
    return { userId: hit.userId, userType: hit.userType };
  }

  set(token: string, value: { userId: string; userType: string }, now: number): void {
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(token, { ...value, expires: now + this.ttlMs });
  }
}
