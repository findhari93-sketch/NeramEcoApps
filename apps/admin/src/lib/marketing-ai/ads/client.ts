/**
 * Google Ads API over plain REST.
 *
 * No SDK: the official Node client is gRPC and heavy, and the four calls the
 * agent makes (searchStream, mutate, uploadClickConversions, token refresh)
 * are simple JSON. Same approach as apps/nexus/src/lib/youtube-oauth.ts.
 *
 * Rules this file keeps:
 *  - fetch is injected, so tests run against a fake and never reach Google.
 *  - Tokens and the developer token never appear in an error or a log line.
 *  - Every write takes an explicit validateOnly. The caller decides, never a
 *    default, and actions.ts forces it true unless mutations are allowed.
 */

import type { AdsEnv } from '../config';
import { createMockAdsClient } from './mock';

export type MutateResource = 'campaignCriteria' | 'adGroupCriteria' | 'campaignBudgets' | 'campaigns' | 'adGroupAds';

export interface MutateResponse {
  results: Array<{ resourceName?: string }>;
  partialFailureError?: unknown;
}

export interface ClickConversion {
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  /** Enhanced conversions for leads: SHA-256 hex of the normalised phone (E.164) or email, one per entry. */
  userIdentifiers?: Array<{ hashedPhoneNumber: string } | { hashedEmail: string }>;
  conversionAction: string; // resource name
  conversionDateTime: string; // 'yyyy-mm-dd hh:mm:ss+05:30'
  conversionValue?: number;
  currencyCode?: string;
  orderId?: string;
}

export interface UploadResponse {
  results: Array<Record<string, unknown>>;
  partialFailureError?: { message?: string; details?: unknown[] } | null;
}

export interface AdsClient {
  readonly mode: 'mock' | 'live';
  readonly customerId: string;
  /** Runs a GAQL query and returns every row across all stream batches. */
  search(query: string): Promise<any[]>;
  mutate(resource: MutateResource, operations: unknown[], opts: { validateOnly: boolean }): Promise<MutateResponse>;
  uploadClickConversions(conversions: ClickConversion[], opts: { validateOnly: boolean }): Promise<UploadResponse>;
}

export class GoogleAdsApiError extends Error {
  readonly status: number;
  readonly codes: string[];
  constructor(message: string, status: number, codes: string[]) {
    super(message);
    this.name = 'GoogleAdsApiError';
    this.status = status;
    this.codes = codes;
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_HOST = 'https://googleads.googleapis.com';

interface CachedToken {
  token: string;
  expiresAt: number;
}
const tokenCache = new Map<string, CachedToken>();

/** For tests. */
export function clearAdsTokenCache() {
  tokenCache.clear();
}

async function accessToken(env: AdsEnv, fetchImpl: FetchLike): Promise<string> {
  const cacheKey = `${env.clientId}:${env.refreshToken.slice(-8)}`;
  const hit = tokenCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;

  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      refresh_token: env.refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (!res.ok) {
    let reason = '';
    try {
      reason = ((await res.json()) as any)?.error || '';
    } catch {
      /* ignore */
    }
    // invalid_grant means the refresh token was revoked or expired: re-run scripts/google-ads-auth.ts.
    throw new GoogleAdsApiError(`Google OAuth token refresh failed (${res.status}${reason ? `, ${reason}` : ''})`, res.status, reason ? [reason] : []);
  }
  const body = (await res.json()) as { access_token: string; expires_in?: number };
  tokenCache.set(cacheKey, { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 });
  return body.access_token;
}

/** Pull Google's error codes out of a failure body, without echoing the request. */
export function describeAdsError(body: any): { message: string; codes: string[] } {
  const err = Array.isArray(body) ? body[0]?.error : body?.error;
  const codes: string[] = [];
  const messages: string[] = [];
  for (const detail of err?.details ?? []) {
    for (const e of detail?.errors ?? []) {
      const code = e?.errorCode ? Object.entries(e.errorCode).map(([k, v]) => `${k}.${v}`).join(',') : '';
      if (code) codes.push(code);
      if (e?.message) messages.push(e.message);
    }
  }
  const message = messages[0] || err?.message || 'Google Ads API error';
  return { message, codes };
}

export function createLiveAdsClient(env: AdsEnv, fetchImpl: FetchLike = fetch): AdsClient {
  const base = `${API_HOST}/${env.apiVersion}/customers/${env.customerId}`;

  async function call(path: string, body: unknown): Promise<any> {
    const token = await accessToken(env, fetchImpl);
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    // Access now comes from the OAuth client's Google Cloud project; the token is optional and ignored.
    if (env.developerToken) headers['developer-token'] = env.developerToken;
    if (env.loginCustomerId) headers['login-customer-id'] = env.loginCustomerId;
    const res = await fetchImpl(`${base}${path}`, { method: 'POST', cache: 'no-store', headers, body: JSON.stringify(body) });
    let parsed: any = null;
    try {
      parsed = await res.json();
    } catch {
      /* empty body */
    }
    if (!res.ok) {
      const { message, codes } = describeAdsError(parsed);
      throw new GoogleAdsApiError(`${message} (HTTP ${res.status})`, res.status, codes);
    }
    return parsed;
  }

  return {
    mode: 'live',
    customerId: env.customerId,
    async search(query) {
      const batches = await call('/googleAds:searchStream', { query });
      const rows: any[] = [];
      for (const batch of Array.isArray(batches) ? batches : [batches]) {
        if (Array.isArray(batch?.results)) rows.push(...batch.results);
      }
      return rows;
    },
    async mutate(resource, operations, { validateOnly }) {
      const out = await call(`/${resource}:mutate`, { operations, validateOnly, partialFailure: false });
      return { results: out?.results ?? [], partialFailureError: out?.partialFailureError };
    },
    async uploadClickConversions(conversions, { validateOnly }) {
      const out = await call(':uploadClickConversions', { conversions, partialFailure: true, validateOnly });
      return { results: out?.results ?? [], partialFailureError: out?.partialFailureError ?? null };
    },
  };
}

/** The client for the configured mode. Throws in live mode if credentials are missing. */
export function getAdsClient(env: AdsEnv, fetchImpl?: FetchLike): AdsClient {
  if (env.mode === 'mock') return createMockAdsClient(env.customerId);
  return createLiveAdsClient(env, fetchImpl);
}

export function resourceName(customerId: string, collection: string, id: string): string {
  return `customers/${customerId}/${collection}/${id}`;
}
