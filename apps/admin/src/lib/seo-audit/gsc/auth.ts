/**
 * Service-account sign-in for the Search Console API, with no extra library:
 * a JWT signed with the account's private key (RS256), exchanged for a one-hour
 * access token. Tokens are cached per account and never logged.
 */
import { createSign } from 'crypto';
import type { ServiceAccount } from '../config';

export const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
/** Only for resubmitting sitemaps; everything else reads. */
export const GSC_WRITE_SCOPE = 'https://www.googleapis.com/auth/webmasters';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

/** The signed assertion Google exchanges for an access token. Pure apart from the clock passed in. */
export function signServiceAccountJwt(sa: ServiceAccount, scope: string, nowSec: number): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope,
    aud: sa.token_uri || DEFAULT_TOKEN_URI,
    iat: nowSec,
    exp: nowSec + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key);
  return `${unsigned}.${b64url(signature)}`;
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/** For tests. */
export function clearGscTokenCache() {
  tokenCache.clear();
}

export class GscAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GscAuthError';
    this.status = status;
  }
}

export async function getGscAccessToken(sa: ServiceAccount, fetchImpl: FetchLike = fetch, scope: string = GSC_SCOPE): Promise<string> {
  const cacheKey = `${sa.client_email}|${scope}`;
  const hit = tokenCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;

  const assertion = signServiceAccountJwt(sa, scope, Math.floor(Date.now() / 1000));
  const res = await fetchImpl(sa.token_uri || DEFAULT_TOKEN_URI, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
  });
  if (!res.ok) {
    let reason = '';
    try {
      reason = ((await res.json()) as any)?.error_description || '';
    } catch {
      /* ignore */
    }
    throw new GscAuthError(`Search Console sign-in failed (${res.status}${reason ? `, ${reason}` : ''})`, res.status);
  }
  const body = (await res.json()) as { access_token: string; expires_in?: number };
  tokenCache.set(cacheKey, { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 });
  return body.access_token;
}
