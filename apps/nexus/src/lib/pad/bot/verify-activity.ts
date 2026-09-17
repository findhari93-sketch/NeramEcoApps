/**
 * Is this request really from the Bot Framework connector, sent to this bot?
 *
 * The bot route believes nothing in a request until this passes. Every rule in
 * Microsoft's "Authenticate requests from the Bot Connector service to your bot"
 * is checked:
 *   1. a Bearer token in the Authorization header,
 *   2. a well-formed JWT,
 *   3. issuer https://api.botframework.com,
 *   4. audience equal to the bot's app id,
 *   5. inside its lifetime, give or take five minutes,
 *   6. an RS256 signature by a key from the connector's published key set,
 *   7. a serviceUrl claim equal to the activity's serviceUrl,
 * and the signing key must be endorsed for the activity's channel. This bot
 * serves Teams only. A missing endorsement answers 403, anything else 401.
 *
 * Node crypto only, like teams-sso.ts. Config: PAD_BOT_APP_ID, or AZ_CLIENT_ID
 * when the bot is registered on the same Entra app as Nexus.
 */

import { createPublicKey, verify as verifySignature, type KeyObject } from 'crypto';

export const BOT_CONNECTOR_ISSUER = 'https://api.botframework.com';
export const BOT_CONNECTOR_KEYS_URL = 'https://login.botframework.com/v1/.well-known/keys';
/** The only channel this bot serves. */
export const TEAMS_CHANNEL_ID = 'msteams';

const CLOCK_SKEW_SECONDS = 5 * 60;
/** Microsoft asks bots to refresh the key set at least once every 24 hours. */
const KEYS_TTL_MS = 24 * 60 * 60 * 1000;
/** An unknown key id may trigger a refetch, but a flood of forged ids may not. */
const KEYS_MIN_REFETCH_MS = 5 * 60 * 1000;

/** Every refusal. The message is for server logs; the route answers with the status only. */
export class BotAuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
    this.name = 'BotAuthError';
  }
}

export function botAppId(): string | null {
  const id = (process.env.PAD_BOT_APP_ID || process.env.AZ_CLIENT_ID || '').trim().toLowerCase();
  return id || null;
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

interface ConnectorKey {
  key: KeyObject;
  /** The channels this key may sign for. */
  endorsements: string[];
}

interface KeySet {
  keys: Map<string, ConnectorKey>;
  fetchedAt: number;
}

let keySet: KeySet | null = null;
let pending: Promise<KeySet> | null = null;

/** Test seam. Forgets the cached connector keys. */
export function __resetBotConnectorKeys(): void {
  keySet = null;
  pending = null;
}

async function fetchKeySet(): Promise<KeySet> {
  const response = await fetch(BOT_CONNECTOR_KEYS_URL);
  if (!response.ok) throw new BotAuthError(`Connector keys unavailable: ${response.status}`, 401);

  const body = asRecord(await response.json());
  const entries = body && Array.isArray(body.keys) ? body.keys : [];
  const keys = new Map<string, ConnectorKey>();
  for (const entry of entries) {
    const jwk = asRecord(entry);
    if (!jwk || jwk.kty !== 'RSA' || typeof jwk.kid !== 'string' || typeof jwk.n !== 'string' || typeof jwk.e !== 'string') continue;
    try {
      keys.set(jwk.kid, {
        key: createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' }),
        endorsements: Array.isArray(jwk.endorsements) ? jwk.endorsements.filter((value): value is string => typeof value === 'string') : [],
      });
    } catch {
      // A key Node cannot read is skipped; a token signed with it fails as unsigned.
    }
  }
  // Failures are never cached (the throw above happens first).
  return { keys, fetchedAt: Date.now() };
}

async function connectorKey(kid: string): Promise<ConnectorKey | null> {
  const now = Date.now();
  if (keySet && now - keySet.fetchedAt < KEYS_TTL_MS) {
    const known = keySet.keys.get(kid);
    if (known) return known;
    if (now - keySet.fetchedAt < KEYS_MIN_REFETCH_MS) return null;
  }

  if (!pending) {
    pending = fetchKeySet().finally(() => {
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

export interface VerifiedBotRequest {
  appId: string;
  serviceUrl: string;
  channelId: string;
}

export async function verifyBotRequest(
  authorization: string | null,
  activity: Record<string, unknown>,
  appId: string | null = botAppId(),
): Promise<VerifiedBotRequest> {
  if (!appId) throw new BotAuthError('Bot is not configured', 401);

  const bearer = /^Bearer (\S+)$/i.exec(authorization ?? '');
  if (!bearer) throw new BotAuthError('Missing bearer token', 401);

  const jwt = decodeJwt(bearer[1]);
  if (!jwt) throw new BotAuthError('Malformed token', 401);
  const { header, payload } = jwt;

  // RS256 only. Anything else, including "none", is refused before a key is looked up.
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new BotAuthError('Unsupported token algorithm', 401);
  const entry = await connectorKey(header.kid);
  if (!entry || !signatureValid(jwt, entry.key)) throw new BotAuthError('Token signature invalid', 401);

  if (payload.iss !== BOT_CONNECTOR_ISSUER) throw new BotAuthError('Token issuer mismatch', 401);
  if (text(payload.aud).toLowerCase() !== appId) throw new BotAuthError('Token audience mismatch', 401);

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_SECONDS < now) throw new BotAuthError('Token expired', 401);
  if (typeof payload.nbf === 'number' && payload.nbf - CLOCK_SKEW_SECONDS > now) throw new BotAuthError('Token not yet valid', 401);

  // Without this, a captured token could carry a forged activity that sends the
  // bot's replies, and its connector token, to a server of the attacker's choosing.
  const serviceUrl = text(activity.serviceUrl);
  const claimed = text(payload.serviceurl) || text(payload.serviceUrl);
  if (!serviceUrl || claimed !== serviceUrl) throw new BotAuthError('Service URL mismatch', 401);

  const channelId = text(activity.channelId);
  if (channelId !== TEAMS_CHANNEL_ID || !entry.endorsements.includes(TEAMS_CHANNEL_ID)) {
    throw new BotAuthError('Channel not endorsed', 403);
  }

  return { appId, serviceUrl, channelId };
}
