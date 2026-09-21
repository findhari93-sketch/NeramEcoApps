/**
 * Automatic Teams chats, sent as a teacher who connected their Teams once.
 *
 * Founder decision, 2026-09-14: automatic reminders reach the student exactly the
 * way a teacher's manual message does, as a Teams 1:1 chat from that teacher, so
 * the student can reply to a person. A chat message can only be posted by a
 * signed-in person, and an 18:00 cron has nobody signed in. So a teacher presses
 * "Connect Teams" once, signs in with Microsoft, and Nexus keeps a refresh token
 * that can read their profile and send chats. From then on:
 *
 *   getSenderAccessToken(userId)  a fresh delegated token, renewing when stale
 *   renewSenders()                the daily touch that keeps the token alive
 *
 * and sendNudge({ sendAs }) posts through sendTeamsChatMessage, the same code the
 * manual Send button uses.
 *
 * Same Azure app as the Nexus sign-in (aa039c70), so the chat permissions teachers
 * already approved apply. The one Azure change is a Web redirect URI for
 * /api/teams/sender/callback (see teams-app/README.md).
 *
 * The OAuth state rides in an httpOnly cookie signed with the app's client secret
 * and bound to the teacher and classroom, because the callback arrives as a plain
 * browser redirect with no Nexus bearer token (the YouTube connect flow learned
 * that the hard way).
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getSupabaseAdminClient } from '@neram/database';

export const SENDER_SCOPES = ['openid', 'profile', 'offline_access', 'User.Read', 'Chat.ReadWrite', 'ChatMessage.Send'];
export const SENDER_STATE_COOKIE = 'teams_sender_state';
export const SENDER_CALLBACK_PATH = '/api/teams/sender/callback';

/** Refresh a little early so a token never expires between two chats of one batch. */
const EXPIRY_SKEW_MS = 5 * 60_000;
/** A token untouched this long gets renewed by the daily pass. Microsoft's idle limit is 90 days. */
const RENEW_AFTER_MS = 20 * 3600_000;
const STATE_TTL_MS = 10 * 60_000;

type Env = Record<string, string | undefined>;

export interface SenderAppConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
}

export function senderAppConfig(env: Env = process.env): SenderAppConfig | null {
  const clientId = (env.AZ_CLIENT_ID || '').trim();
  const clientSecret = (env.AZ_CLIENT_SECRET || '').trim();
  const tenantId = (env.AZ_TENANT_ID || '').trim();
  if (!clientId || !clientSecret || !tenantId) return null;
  return { clientId, clientSecret, tenantId };
}

/** Where Microsoft sends the teacher back. Must match a Web redirect URI on the app exactly. */
export function senderRedirectUri(origin: string, env: Env = process.env): string {
  const override = (env.TEAMS_SENDER_REDIRECT_URI || '').trim();
  if (override) return override;
  const base = ((env.NEXT_PUBLIC_NEXUS_URL || '').trim() || origin).replace(/\/+$/, '');
  return `${base}${SENDER_CALLBACK_PATH}`;
}

// ── State cookie ────────────────────────────────────────────────────────────

export interface SenderState {
  /** Random, also sent to Microsoft as `state`. */
  s: string;
  /** Nexus users.id of the teacher who started. */
  u: string;
  /** Classroom whose reminders this teacher will send. */
  c: string;
  /** Where to return after, a path inside Nexus. */
  r: string;
  /** Expiry, epoch ms. */
  exp: number;
}

const b64url = (b: Buffer) => b.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export function newSenderState(userId: string, classroomId: string, returnTo: string, now = Date.now()): SenderState {
  return { s: b64url(randomBytes(18)), u: userId, c: classroomId, r: safeReturnPath(returnTo), exp: now + STATE_TTL_MS };
}

/** Only a path inside Nexus, never an absolute URL (no open redirect). */
export function safeReturnPath(path: string): string {
  return /^\/(?!\/)[\w\-/?=&.%]*$/.test(path || '') ? path : '/teacher/sketchbook?view=rhythm';
}

export function signSenderState(state: SenderState, secret: string): string {
  const body = b64url(Buffer.from(JSON.stringify(state)));
  const mac = b64url(createHmac('sha256', secret).update(body).digest());
  return `${body}.${mac}`;
}

export function verifySenderState(cookie: string | undefined, secret: string, now = Date.now()): SenderState | null {
  if (!cookie) return null;
  const [body, mac] = cookie.split('.');
  if (!body || !mac) return null;
  const expected = createHmac('sha256', secret).update(body).digest();
  const given = fromB64url(mac);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const state = JSON.parse(fromB64url(body).toString('utf8')) as SenderState;
    if (typeof state.exp !== 'number' || state.exp < now) return null;
    if (!state.s || !state.u || !state.c) return null;
    return state;
  } catch {
    return null;
  }
}

// ── Microsoft endpoints ─────────────────────────────────────────────────────

export function buildSenderAuthorizeUrl(
  cfg: SenderAppConfig,
  opts: { redirectUri: string; state: string; loginHint?: string | null },
): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    redirect_uri: opts.redirectUri,
    response_mode: 'query',
    scope: SENDER_SCOPES.join(' '),
    state: opts.state,
    prompt: 'select_account',
  });
  if (opts.loginHint) params.set('login_hint', opts.loginHint);
  return `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
}

export interface SenderTokens {
  accessToken: string;
  refreshToken: string | null;
  scope: string;
  expiresAt: string;
}

export class SenderTokenError extends Error {
  constructor(message: string, readonly revoked: boolean) {
    super(message);
    this.name = 'SenderTokenError';
  }
}

async function postToken(cfg: SenderAppConfig, body: Record<string, string>, fetchImpl: typeof fetch): Promise<SenderTokens> {
  const res = await fetchImpl(`https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...body }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) {
    // invalid_grant: the teacher signed out everywhere, changed password, left, or
    // the token sat unused past Microsoft's limit. Only reconnecting fixes it.
    const code = String(json.error || `token ${res.status}`);
    const detail = String(json.error_description || '').split('\r\n')[0].slice(0, 160);
    throw new SenderTokenError(detail ? `${code}: ${detail}` : code, code === 'invalid_grant' || code === 'interaction_required');
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    scope: json.scope || '',
    expiresAt: new Date(Date.now() + Number(json.expires_in || 3600) * 1000).toISOString(),
  };
}

export function exchangeSenderCode(
  cfg: SenderAppConfig,
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SenderTokens> {
  return postToken(cfg, { grant_type: 'authorization_code', code, redirect_uri: redirectUri, scope: SENDER_SCOPES.join(' ') }, fetchImpl);
}

export function refreshSenderToken(cfg: SenderAppConfig, refreshToken: string, fetchImpl: typeof fetch = fetch): Promise<SenderTokens> {
  return postToken(cfg, { grant_type: 'refresh_token', refresh_token: refreshToken, scope: SENDER_SCOPES.join(' ') }, fetchImpl);
}

/** Who actually signed in, so a teacher cannot connect somebody else's account by mistake. */
export async function fetchSenderIdentity(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ oid: string; name: string | null; upn: string | null } | null> {
  const res = await fetchImpl('https://graph.microsoft.com/v1.0/me?$select=id,displayName,userPrincipalName', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const me = (await res.json().catch(() => null)) as Record<string, any> | null;
  return me?.id ? { oid: me.id, name: me.displayName ?? null, upn: me.userPrincipalName ?? null } : null;
}

// ── Stored senders ──────────────────────────────────────────────────────────

export interface SenderDeps {
  supabase?: any;
  fetch?: typeof fetch;
  config?: SenderAppConfig | null;
  now?: number;
}

const SELECT = 'user_id, ms_oid, display_name, refresh_token, access_token, access_token_expires_at, last_refreshed_at, revoked_at';

async function renewRow(row: any, cfg: SenderAppConfig, supabase: any, fetchImpl: typeof fetch): Promise<string> {
  try {
    const fresh = await refreshSenderToken(cfg, row.refresh_token, fetchImpl);
    const { error } = await supabase
      .from('nexus_teams_senders')
      .update({
        access_token: fresh.accessToken,
        access_token_expires_at: fresh.expiresAt,
        // Microsoft rotates the refresh token; keep the newest or the old one ages out.
        ...(fresh.refreshToken ? { refresh_token: fresh.refreshToken } : {}),
        last_refreshed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('user_id', row.user_id);
    if (error) console.error('[teams-sender] could not store renewed token:', error.message);
    return fresh.accessToken;
  } catch (err) {
    const e = err instanceof SenderTokenError ? err : new SenderTokenError(err instanceof Error ? err.message : 'renew failed', false);
    await supabase
      .from('nexus_teams_senders')
      .update({ last_error: e.message.slice(0, 300), ...(e.revoked ? { revoked_at: new Date().toISOString() } : {}) })
      .eq('user_id', row.user_id);
    throw e;
  }
}

/**
 * A delegated token for this teacher, or a SenderTokenError saying why not.
 * revoked=true means only reconnecting will fix it.
 */
export async function getSenderAccessToken(userId: string, deps: SenderDeps = {}): Promise<string> {
  const cfg = deps.config === undefined ? senderAppConfig() : deps.config;
  if (!cfg) throw new SenderTokenError('Teams sending is not set up on this server', false);
  const supabase = deps.supabase || (getSupabaseAdminClient() as any);
  const { data: row, error } = await supabase.from('nexus_teams_senders').select(SELECT).eq('user_id', userId).maybeSingle();
  if (error) throw new SenderTokenError(`Could not read the Teams connection: ${error.message}`, false);
  if (!row) throw new SenderTokenError('This teacher has not connected Teams', true);
  if (row.revoked_at) throw new SenderTokenError('The Teams connection stopped working and needs reconnecting', true);

  const now = deps.now ?? Date.now();
  const expiresAt = row.access_token_expires_at ? Date.parse(row.access_token_expires_at) : 0;
  if (row.access_token && expiresAt - EXPIRY_SKEW_MS > now) return row.access_token;
  return renewRow(row, cfg, supabase, deps.fetch || fetch);
}

/** Mark a sender as used, after a chat went out. Best effort. */
export async function touchSender(userId: string, supabase: any = getSupabaseAdminClient()): Promise<void> {
  await (supabase as any).from('nexus_teams_senders').update({ last_used_at: new Date().toISOString() }).eq('user_id', userId);
}

/**
 * Keep every connection alive. A refresh token left unused goes stale, so the
 * daily digest cron calls this whether or not any reminder went out. Returns the
 * senders that stopped working, so the caller can tell them.
 */
export async function renewSenders(deps: SenderDeps = {}): Promise<{ renewed: number; failed: Array<{ userId: string; reason: string; revoked: boolean }> }> {
  const cfg = deps.config === undefined ? senderAppConfig() : deps.config;
  const out = { renewed: 0, failed: [] as Array<{ userId: string; reason: string; revoked: boolean }> };
  if (!cfg) return out;
  const supabase = deps.supabase || (getSupabaseAdminClient() as any);
  const now = deps.now ?? Date.now();
  const { data, error } = await supabase.from('nexus_teams_senders').select(SELECT).is('revoked_at', null);
  if (error) throw error;
  for (const row of (data || []) as any[]) {
    const last = row.last_refreshed_at ? Date.parse(row.last_refreshed_at) : 0;
    if (now - last < RENEW_AFTER_MS) continue;
    try {
      await renewRow(row, cfg, supabase, deps.fetch || fetch);
      out.renewed += 1;
    } catch (err) {
      const e = err as SenderTokenError;
      out.failed.push({ userId: row.user_id, reason: e.message, revoked: e.revoked === true });
    }
  }
  return out;
}

/** What a cron spreads into sendNudge to say who this classroom's reminders come from. */
export type AutomaticSender = { assistant: { fallbackSenderUserId: string | null } };

/**
 * For a cron that reminds students one at a time: who a classroom's automatic
 * messages come from, looked up once per classroom per run. Spread it into
 * sendNudge.
 *
 * NOBODY WROTE THESE, so they come from Neram Assistant (founder, 2026-09-20).
 * A sweep that fires every weekday morning is not a teacher talking, and sending
 * it from one turns a real conversation into a notification log. The connected
 * teacher is kept as the named fallback so that switching the Assistant on is a
 * decision rather than an outage: while staff.assistant-sender is off, every one
 * of these behaves exactly as it did before.
 *
 * A null fallback used to mean no chat at all. With the Assistant on it no longer
 * does: a classroom whose teacher never connected Teams can now be reached.
 */
export function senderLookup(supabase: any = getSupabaseAdminClient()) {
  const memo = new Map<string, Promise<AutomaticSender>>();
  return (classroomId: string | null | undefined): Promise<AutomaticSender> => {
    if (!classroomId) return Promise.resolve({ assistant: { fallbackSenderUserId: null } });
    let hit = memo.get(classroomId);
    if (!hit) {
      hit = classroomSenders([classroomId], supabase)
        .then((m) => ({ assistant: { fallbackSenderUserId: m[classroomId]?.userId ?? null } }))
        .catch(() => ({ assistant: { fallbackSenderUserId: null } }) as AutomaticSender);
      memo.set(classroomId, hit);
    }
    return hit;
  };
}

/**
 * Whose Teams sends this classroom's automatic reminders: the teacher named on the
 * classroom, provided their connection is live. Null means reminders go to the
 * Nexus bell (and the Teams activity feed) only.
 */
export async function classroomSenders(
  classroomIds: string[],
  supabase: any = getSupabaseAdminClient(),
): Promise<Record<string, { userId: string; name: string | null } | null>> {
  const out: Record<string, { userId: string; name: string | null } | null> = {};
  for (const id of classroomIds) out[id] = null;
  if (!classroomIds.length) return out;
  const { data: rooms, error } = await (supabase as any)
    .from('nexus_classrooms')
    .select('id, reminder_sender_id')
    .in('id', classroomIds);
  if (error) throw error;
  const senderIds = [...new Set(((rooms || []) as any[]).map((r) => r.reminder_sender_id).filter(Boolean))];
  if (!senderIds.length) return out;
  const { data: senders } = await (supabase as any)
    .from('nexus_teams_senders')
    .select('user_id, display_name, revoked_at')
    .in('user_id', senderIds);
  const live = new Map(((senders || []) as any[]).filter((s) => !s.revoked_at).map((s) => [s.user_id, s.display_name ?? null]));
  for (const r of (rooms || []) as any[]) {
    if (r.reminder_sender_id && live.has(r.reminder_sender_id)) {
      out[r.id] = { userId: r.reminder_sender_id, name: live.get(r.reminder_sender_id) ?? null };
    }
  }
  return out;
}
