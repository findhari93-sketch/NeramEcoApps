/**
 * Teams single sign-on tokens for Nexus API routes.
 *
 * Inside a Teams tab, `authentication.getAuthToken()` returns an Entra access
 * token issued to THIS app (audience: our client id, or its api:// URI), not to
 * Microsoft Graph. The Graph /me check in ms-verify.ts cannot validate a token
 * like that, so it is validated here, locally: the RS256 signature against the
 * tenant's published signing keys, then audience, tenant, issuer, lifetime, the
 * access_as_user scope and the requesting client (Teams desktop/mobile or web).
 *
 * Node crypto only, as impersonation-token.ts does, so no new dependency.
 * verifyMsToken branches here only for tokens whose unverified audience is this
 * app; every other token keeps the path it had before.
 *
 * Config: AZ_CLIENT_ID and AZ_TENANT_ID (already set for Graph app access), plus
 * optional TEAMS_SSO_RESOURCE_HOSTS, a comma list of hosts accepted in an
 * api://<host>/<client id> audience. It defaults to nexus.neramclasses.com; add
 * the dev tunnel host locally.
 */

import { createPublicKey, verify as verifySignature, type JsonWebKey, type KeyObject } from 'crypto';

/** Teams desktop and mobile, then Teams web: the clients Microsoft pre-authorizes for tab SSO. */
export const TEAMS_CLIENT_IDS: readonly string[] = [
  '1fec8e78-bce4-4aaf-ab1b-5451cc387264',
  '5e3ce6c0-2b1f-4285-8d4b-75ee78787346',
];

const REQUIRED_SCOPE = 'access_as_user';
const CLOCK_SKEW_SECONDS = 5 * 60;
/** Microsoft publishes a new signing key well before it starts using it. */
const KEYS_TTL_MS = 24 * 60 * 60 * 1000;
/** An unknown key id may trigger a refetch, but a flood of forged ids may not. */
const KEYS_MIN_REFETCH_MS = 5 * 60 * 1000;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface TeamsSsoConfig {
  clientId: string;
  tenantId: string;
  resourceHosts: string[];
}

export interface TeamsSsoIdentity {
  /** Entra object id, lowercase; matches users.ms_oid. */
  oid: string;
  tid: string;
  email: string;
  name: string;
}

/** Every refusal. The message is for server logs; callers answer 401 without echoing it. */
export class TeamsSsoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TeamsSsoError';
  }
}

/**
 * Microsoft's signing keys could not be fetched. Deliberately not a TeamsSsoError:
 * nothing is known about the token yet, and a refusal would sign the user out over
 * a Microsoft outage. Callers answer 503 (PERF-0013).
 */
export class TeamsSsoUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TeamsSsoUnavailableError';
  }
}

export function teamsSsoConfig(): TeamsSsoConfig | null {
  const clientId = process.env.AZ_CLIENT_ID?.trim().toLowerCase();
  const tenantId = process.env.AZ_TENANT_ID?.trim().toLowerCase();
  if (!clientId || !tenantId) return null;
  const resourceHosts = (process.env.TEAMS_SSO_RESOURCE_HOSTS || 'nexus.neramclasses.com')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return { clientId, tenantId, resourceHosts };
}

interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signingInput: string;
  signature: Buffer;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function decodeJwt(token: string): DecodedJwt | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) return null;
  try {
    const header = asRecord(JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8')));
    const payload = asRecord(JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8')));
    if (!header || !payload) return null;
    return { header, payload, signingInput: `${parts[0]}.${parts[1]}`, signature: Buffer.from(parts[2], 'base64url') };
  } catch {
    return null;
  }
}

function isOurAudience(aud: unknown, config: TeamsSsoConfig): boolean {
  const value = text(aud).toLowerCase();
  if (!value) return false;
  if (value === config.clientId) return true;
  const match = /^api:\/\/([^/]+)\/([^/]+)$/.exec(value);
  return !!match && match[2] === config.clientId && config.resourceHosts.includes(match[1]);
}

/**
 * Cheap and unverified: is this token addressed to this app? verifyMsToken uses
 * it only to choose a path. Nothing is trusted until verifyTeamsSsoToken passes.
 */
export function isTeamsSsoToken(token: string, config: TeamsSsoConfig | null = teamsSsoConfig()): boolean {
  if (!config) return false;
  const jwt = decodeJwt(token);
  return !!jwt && isOurAudience(jwt.payload.aud, config);
}

interface KeySet {
  tenantId: string;
  keys: Map<string, KeyObject>;
  fetchedAt: number;
}

let keySet: KeySet | null = null;
let pending: Promise<KeySet> | null = null;

/** Test seam. Forgets the cached signing keys. */
export function __resetTeamsSsoKeys(): void {
  keySet = null;
  pending = null;
}

async function fetchKeySet(tenantId: string): Promise<KeySet> {
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/discovery/v2.0/keys`);
  if (!response.ok) throw new TeamsSsoUnavailableError(`Signing keys unavailable: ${response.status}`);

  const body = asRecord(await response.json());
  const entries = body && Array.isArray(body.keys) ? body.keys : [];
  const keys = new Map<string, KeyObject>();
  for (const entry of entries) {
    const jwk = asRecord(entry);
    if (!jwk || jwk.kty !== 'RSA' || typeof jwk.kid !== 'string' || (jwk.use !== undefined && jwk.use !== 'sig')) continue;
    try {
      keys.set(jwk.kid, createPublicKey({ key: jwk as JsonWebKey, format: 'jwk' }));
    } catch {
      // A key Node cannot read is skipped; a token signed with it fails as unsigned.
    }
  }
  // Failures are never cached (the throw above happens first), so a Microsoft
  // outage costs a retry, not an hour of refused sign-ins.
  return { tenantId, keys, fetchedAt: Date.now() };
}

async function signingKey(kid: string, tenantId: string): Promise<KeyObject | null> {
  const now = Date.now();
  const current = keySet && keySet.tenantId === tenantId ? keySet : null;
  if (current && now - current.fetchedAt < KEYS_TTL_MS) {
    const key = current.keys.get(kid);
    if (key) return key;
    if (now - current.fetchedAt < KEYS_MIN_REFETCH_MS) return null;
  }

  if (!pending) {
    pending = fetchKeySet(tenantId).finally(() => {
      pending = null;
    });
  }
  keySet = await pending;
  return keySet.keys.get(kid) ?? null;
}

function signatureValid(jwt: DecodedJwt, key: KeyObject): boolean {
  try {
    return verifySignature('RSA-SHA256', Buffer.from(jwt.signingInput), key, jwt.signature);
  } catch {
    return false;
  }
}

export async function verifyTeamsSsoToken(
  token: string,
  config: TeamsSsoConfig | null = teamsSsoConfig(),
): Promise<TeamsSsoIdentity> {
  if (!config) throw new TeamsSsoError('Teams sign-in is not configured');

  const jwt = decodeJwt(token);
  if (!jwt) throw new TeamsSsoError('Malformed token');
  const { header, payload } = jwt;

  // RS256 only. Anything else, including "none" and HS256 signed with a public
  // key as the secret, is refused before a key is even looked up.
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    throw new TeamsSsoError('Unsupported token algorithm');
  }
  const key = await signingKey(header.kid, config.tenantId);
  if (!key || !signatureValid(jwt, key)) throw new TeamsSsoError('Token signature invalid');

  if (!isOurAudience(payload.aud, config)) throw new TeamsSsoError('Token audience mismatch');

  const tid = text(payload.tid).toLowerCase();
  if (tid !== config.tenantId) throw new TeamsSsoError('Token tenant mismatch');

  const issuer = text(payload.iss).toLowerCase();
  if (issuer !== `https://login.microsoftonline.com/${tid}/v2.0` && issuer !== `https://sts.windows.net/${tid}/`) {
    throw new TeamsSsoError('Token issuer mismatch');
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_SECONDS < now) {
    throw new TeamsSsoError('Token expired');
  }
  if (typeof payload.nbf === 'number' && payload.nbf - CLOCK_SKEW_SECONDS > now) {
    throw new TeamsSsoError('Token not yet valid');
  }

  if (!text(payload.scp).split(' ').includes(REQUIRED_SCOPE)) throw new TeamsSsoError('Token scope missing');

  // v2 tokens name the requesting client in azp, v1 tokens in appid.
  const client = (text(payload.azp) || text(payload.appid)).toLowerCase();
  if (!TEAMS_CLIENT_IDS.includes(client)) throw new TeamsSsoError('Token client not allowed');

  const oid = text(payload.oid).toLowerCase();
  if (!GUID.test(oid)) throw new TeamsSsoError('Token has no user');

  return {
    oid,
    tid,
    email: text(payload.preferred_username) || text(payload.upn) || text(payload.unique_name),
    name: text(payload.name),
  };
}
