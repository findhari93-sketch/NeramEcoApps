/**
 * The Neram Assistant bot: how an AUTOMATED message reaches a student's Teams
 * chat.
 *
 * Why a bot: a Teams 1:1 chat message can only be posted by a signed-in person
 * (delegated token). A cron has no person, so before this every reminder landed
 * only in the activity feed or the Nexus bell. A notification-only bot inside
 * the Neram Assistant app can post into its own 1:1 chat with each user, which
 * Microsoft supports for exactly this ("proactive messages").
 *
 * The path, per user:
 *   1. The cached conversation (nexus_teams_bot_conversations), else
 *   2. Graph: find the Neram Assistant install for the user, install it if
 *      missing, upgrade it if the install predates the bot, then read the
 *      install's 1:1 chat id, and cache it.
 *   3. Bot Connector: POST the message into that conversation.
 *
 * One-time setup (founder, outside code): an Azure Bot resource on the existing
 * app registration, messaging endpoint /api/teams/bot/messages, the Teams channel
 * enabled, and manifest v1.1.0 (with `bots`) uploaded in Teams admin. Until
 * TEAMS_BOT_ENABLED=1 is set, botConfig() returns null and nothing here runs.
 *
 * Never throws out of sendBotMessage: a failure comes back with a reason a
 * teacher can act on, like every other tier in nudge-delivery.ts.
 */

import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { getSupabaseAdminClient } from '@neram/database';
import { getAppOnlyToken } from '@neram/auth';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const BOT_OPENID = 'https://login.botframework.com/v1/.well-known/openidconfiguration';
const BOT_ISSUER = 'https://api.botframework.com';
const DEFAULT_SERVICE_URL = 'https://smba.trafficmanager.net/teams/';
const CLOCK_SKEW_S = 300;
const TIMEOUT_MS = 10_000;

export interface BotConfig {
  appId: string;
  secret: string;
  tenantId: string;
  serviceUrl: string;
  catalogAppId: string | null;
}

type Env = Record<string, string | undefined>;

export function botConfig(env: Env = process.env): BotConfig | null {
  if ((env.TEAMS_BOT_ENABLED || '').trim() !== '1') return null;
  const appId = (env.TEAMS_BOT_APP_ID || env.AZ_CLIENT_ID || '').trim();
  const secret = (env.TEAMS_BOT_APP_SECRET || env.AZ_CLIENT_SECRET || '').trim();
  const tenantId = (env.AZ_TENANT_ID || '').trim();
  if (!appId || !secret || !tenantId) return null;
  let serviceUrl = (env.TEAMS_BOT_SERVICE_URL || DEFAULT_SERVICE_URL).trim();
  if (!serviceUrl.endsWith('/')) serviceUrl += '/';
  const catalogAppId = (env.TEAMS_APP_CATALOG_ID || '').trim() || null;
  return { appId, secret, tenantId, serviceUrl, catalogAppId };
}

async function timedFetch(fetchImpl: typeof fetch, url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Bot Connector token ─────────────────────────────────────────────────────

let connectorToken: { token: string; expiresAt: number } | null = null;

export async function getBotConnectorToken(cfg: BotConfig, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (connectorToken && Date.now() < connectorToken.expiresAt - 60_000) return connectorToken.token;
  // Single-tenant bot: the token comes from the tenant, not botframework.com.
  const res = await timedFetch(fetchImpl, `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cfg.appId,
      client_secret: cfg.secret,
      scope: 'https://api.botframework.com/.default',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Bot token refused (${res.status}) ${text.slice(0, 160)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  connectorToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

/** Test seam: forget cached tokens and keys. */
export function resetBotCaches(): void {
  connectorToken = null;
  keyCache = null;
}

// ── Inbound JWT (Teams to our endpoint) ─────────────────────────────────────

export interface BotJwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  endorsements?: string[];
}

let keyCache: { keys: BotJwk[]; at: number } | null = null;

export async function loadBotFrameworkKeys(fetchImpl: typeof fetch = fetch, force = false): Promise<BotJwk[]> {
  if (!force && keyCache && Date.now() - keyCache.at < 24 * 3600_000) return keyCache.keys;
  const config = await (await timedFetch(fetchImpl, BOT_OPENID)).json();
  const jwks = await (await timedFetch(fetchImpl, config.jwks_uri)).json();
  keyCache = { keys: jwks.keys || [], at: Date.now() };
  return keyCache.keys;
}

function b64urlDecode(part: string): Buffer {
  return Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export type JwtCheck = { ok: true; claims: Record<string, unknown> } | { ok: false; reason: string };

/**
 * Verify the Bot Framework token on an incoming activity. Anything that fails is
 * a 401: the endpoint is public and must only act on messages Teams really sent.
 */
export async function verifyBotFrameworkJwt(
  authHeader: string | null,
  activity: { serviceUrl?: string; channelId?: string },
  deps: { appId: string; now?: number; loadKeys?: (force: boolean) => Promise<BotJwk[]> },
): Promise<JwtCheck> {
  const match = /^Bearer\s+(.+)$/i.exec(authHeader || '');
  if (!match) return { ok: false, reason: 'missing bearer token' };
  const parts = match[1].split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed token' };

  let header: { alg?: string; kid?: string };
  let claims: Record<string, any>;
  try {
    header = JSON.parse(b64urlDecode(parts[0]).toString('utf8'));
    claims = JSON.parse(b64urlDecode(parts[1]).toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed token' };
  }
  if (header.alg !== 'RS256' || !header.kid) return { ok: false, reason: 'unexpected algorithm' };

  const loadKeys = deps.loadKeys || ((force: boolean) => loadBotFrameworkKeys(fetch, force));
  let key = (await loadKeys(false)).find((k) => k.kid === header.kid);
  if (!key) key = (await loadKeys(true)).find((k) => k.kid === header.kid);
  if (!key) return { ok: false, reason: 'unknown signing key' };

  const signed = verifySignature(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    createPublicKey({ key: { kty: key.kty, n: key.n, e: key.e }, format: 'jwk' }),
    b64urlDecode(parts[2]),
  );
  if (!signed) return { ok: false, reason: 'bad signature' };

  const now = Math.floor((deps.now ?? Date.now()) / 1000);
  if (claims.iss !== BOT_ISSUER) return { ok: false, reason: 'wrong issuer' };
  if (claims.aud !== deps.appId) return { ok: false, reason: 'wrong audience' };
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_S < now) return { ok: false, reason: 'expired' };
  if (typeof claims.nbf === 'number' && claims.nbf - CLOCK_SKEW_S > now) return { ok: false, reason: 'not yet valid' };
  if (activity.serviceUrl && claims.serviceurl && claims.serviceurl !== activity.serviceUrl) {
    return { ok: false, reason: 'service url mismatch' };
  }
  if (activity.channelId && key.endorsements?.length && !key.endorsements.includes(activity.channelId)) {
    return { ok: false, reason: 'key not endorsed for this channel' };
  }
  return { ok: true, claims };
}

// ── Conversations ───────────────────────────────────────────────────────────

export interface BotUser {
  id: string;
  ms_oid: string | null;
}

export interface BotDeps {
  fetch?: typeof fetch;
  supabase?: any;
  graphToken?: () => Promise<string>;
  config?: BotConfig | null;
}

type Resolved = { ok: true; conversationId: string; serviceUrl: string } | { ok: false; reason: string };

async function graphCall(deps: Required<Pick<BotDeps, 'fetch' | 'graphToken'>>, path: string, init: RequestInit = {}) {
  const token = await deps.graphToken();
  return timedFetch(deps.fetch, `${GRAPH}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

async function findInstall(
  deps: Required<Pick<BotDeps, 'fetch' | 'graphToken'>>,
  oid: string,
  catalogAppId: string,
): Promise<{ id: string; hasBot: boolean } | { error: string } | null> {
  const res = await graphCall(
    deps,
    `/users/${encodeURIComponent(oid)}/teamwork/installedApps?$expand=teamsApp,teamsAppDefinition($expand=bot)`,
  );
  // A 403 here is a missing permission, not "not installed". Say so.
  if (!res.ok) return { error: `Could not read Teams apps (${res.status})` };
  const data = await res.json().catch(() => null);
  const match = (data?.value || []).find(
    (a: any) => a?.teamsApp?.id === catalogAppId || a?.teamsApp?.externalId === catalogAppId,
  );
  if (!match) return null;
  return { id: match.id, hasBot: Boolean(match.teamsAppDefinition?.bot) };
}

export async function resolveBotConversation(user: BotUser, depsIn: BotDeps = {}): Promise<Resolved> {
  const cfg = depsIn.config === undefined ? botConfig() : depsIn.config;
  if (!cfg) return { ok: false, reason: 'Teams bot is not set up on this server' };
  if (!user.ms_oid) return { ok: false, reason: 'No Microsoft account on file' };
  const supabase = depsIn.supabase || (getSupabaseAdminClient() as any);
  const deps = { fetch: depsIn.fetch || fetch, graphToken: depsIn.graphToken || getAppOnlyToken };

  const { data: cached } = await supabase
    .from('nexus_teams_bot_conversations')
    .select('conversation_id, service_url')
    .eq('user_id', user.id)
    .maybeSingle();
  if (cached?.conversation_id) {
    return { ok: true, conversationId: cached.conversation_id, serviceUrl: cached.service_url || cfg.serviceUrl };
  }

  if (!cfg.catalogAppId) return { ok: false, reason: 'Neram Assistant app id is not set on this server' };
  try {
    let install = await findInstall(deps, user.ms_oid, cfg.catalogAppId);
    if (install && 'error' in install) return { ok: false, reason: install.error };
    if (!install) {
      const res = await graphCall(deps, `/users/${encodeURIComponent(user.ms_oid)}/teamwork/installedApps`, {
        method: 'POST',
        body: JSON.stringify({ 'teamsApp@odata.bind': `${GRAPH}/appCatalogs/teamsApps/${cfg.catalogAppId}` }),
      });
      if (!res.ok && res.status !== 409) return { ok: false, reason: `Could not install Neram Assistant (${res.status})` };
      install = await findInstall(deps, user.ms_oid, cfg.catalogAppId);
      if (!install || 'error' in install) return { ok: false, reason: 'Neram Assistant did not install' };
    }
    if (!install.hasBot) {
      // Installed before the bot existed: move this user to the new version.
      const res = await graphCall(
        deps,
        `/users/${encodeURIComponent(user.ms_oid)}/teamwork/installedApps/${encodeURIComponent(install.id)}/upgrade`,
        { method: 'POST', body: '{}' },
      );
      if (!res.ok) return { ok: false, reason: `Could not upgrade Neram Assistant (${res.status})` };
    }
    const chatRes = await graphCall(
      deps,
      `/users/${encodeURIComponent(user.ms_oid)}/teamwork/installedApps/${encodeURIComponent(install.id)}/chat`,
    );
    if (!chatRes.ok) return { ok: false, reason: `Could not open the Neram Assistant chat (${chatRes.status})` };
    const chat = await chatRes.json().catch(() => null);
    if (!chat?.id) return { ok: false, reason: 'Teams returned no chat for Neram Assistant' };

    await supabase.from('nexus_teams_bot_conversations').upsert(
      {
        user_id: user.id,
        ms_oid: user.ms_oid,
        conversation_id: chat.id,
        service_url: cfg.serviceUrl,
        tenant_id: cfg.tenantId,
        source: 'graph_install_chat',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    return { ok: true, conversationId: chat.id, serviceUrl: cfg.serviceUrl };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message.slice(0, 180) : 'Teams bot lookup failed' };
  }
}

// ── Sending ─────────────────────────────────────────────────────────────────

export interface BotCardInput {
  title: string;
  body: string;
  buttonLabel: string;
  url: string;
}

/** An Adaptive Card with one button. Pure. Plain text only: Teams renders card text as markdown-lite. */
export function buildReminderCard(c: BotCardInput): Record<string, unknown> {
  return {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      type: 'AdaptiveCard',
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      version: '1.4',
      body: [
        { type: 'TextBlock', text: c.title, weight: 'Bolder', size: 'Medium', wrap: true },
        { type: 'TextBlock', text: c.body, wrap: true, spacing: 'Small' },
      ],
      actions: [{ type: 'Action.OpenUrl', title: c.buttonLabel, url: c.url }],
    },
  };
}

export interface BotSendResult {
  ok: boolean;
  status: number;
  reason?: string;
}

export async function sendBotMessage(
  user: BotUser,
  message: { text: string; card?: BotCardInput },
  depsIn: BotDeps = {},
): Promise<BotSendResult> {
  const cfg = depsIn.config === undefined ? botConfig() : depsIn.config;
  if (!cfg) return { ok: false, status: 0, reason: 'Teams bot is not set up on this server' };
  const supabase = depsIn.supabase || (getSupabaseAdminClient() as any);
  const fetchImpl = depsIn.fetch || fetch;

  const conv = await resolveBotConversation(user, { ...depsIn, config: cfg, supabase });
  if (!conv.ok) return { ok: false, status: 0, reason: conv.reason };

  try {
    const token = await getBotConnectorToken(cfg, fetchImpl);
    const res = await timedFetch(
      fetchImpl,
      `${conv.serviceUrl}v3/conversations/${encodeURIComponent(conv.conversationId)}/activities`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'message',
          text: message.text,
          textFormat: 'plain',
          ...(message.card ? { attachments: [buildReminderCard(message.card)] } : {}),
        }),
      },
    );
    if (res.ok) {
      await supabase
        .from('nexus_teams_bot_conversations')
        .update({ last_sent_at: new Date().toISOString(), last_error: null })
        .eq('user_id', user.id);
      return { ok: true, status: res.status };
    }
    const text = await res.text().catch(() => '');
    const reason = `Teams bot message refused (${res.status}) ${text.slice(0, 120)}`.trim();
    if (res.status === 403 || res.status === 404) {
      // The user removed the app or the chat is gone: forget it so the next send re-resolves.
      await supabase.from('nexus_teams_bot_conversations').delete().eq('user_id', user.id);
    } else {
      await supabase.from('nexus_teams_bot_conversations').update({ last_error: reason }).eq('user_id', user.id);
    }
    return { ok: false, status: res.status, reason };
  } catch (e) {
    return { ok: false, status: 0, reason: e instanceof Error ? e.message.slice(0, 180) : 'Teams bot send failed' };
  }
}
