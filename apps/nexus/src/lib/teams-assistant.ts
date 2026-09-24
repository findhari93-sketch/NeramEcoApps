/**
 * Neram Assistant: how a message the SYSTEM decided reaches a student's Teams
 * chat, without going out under a member of staff's own name.
 *
 * Why this exists. A Teams 1:1 chat message can only be posted by a signed-in
 * person, so before this every automatic message either borrowed a teacher's
 * stored login or gave up and settled for the activity feed. Borrowing the login
 * is what put "Results for History of Architecture Test are out" in the founder's
 * personal chat with a student, between "good evening sir" and a thumbs-up. A
 * bot inside the Neram Assistant app can post into its own 1:1 chat with each
 * user, which Microsoft supports for exactly this ("proactive messages").
 *
 * The line this module draws, and it is the whole point: the Assistant sends
 * what the system decided (a result is out, a form needs filling, a cron fired).
 * A teacher talking to a student still sends as themselves, through `chat` and
 * `sendAs` in nudge-delivery.ts, so the student can reply to a person.
 *
 * The path, per user:
 *   1. The cached conversation (nexus_teams_assistant_conversations), else
 *   2. Graph: find the Neram Assistant install for the user, install it if it is
 *      missing, upgrade it if the install predates the bot, read the install's
 *      1:1 chat id, and cache it.
 *   3. Bot Connector: post the message into that conversation.
 *
 * Reuses the Answer Pad's bot plumbing rather than growing its own: it is the
 * SAME bot registration (manifest.json bots[0].botId is the Pad's botId), so
 * connectorToken() and postToConversation() already speak for this identity.
 *
 * One-time setup, outside code: manifest v1.2.0 with "personal" in bots[0].scopes
 * uploaded and approved in Teams admin. Until that lands, Graph returns an
 * install without a personal chat, resolve fails with a reason, and delivery
 * falls through to the activity feed and the bell exactly as it does today.
 *
 * Never throws. A failure comes back with a reason a teacher can act on, like
 * every other tier in nudge-delivery.ts.
 */

import { getSupabaseAdminClient } from '@neram/database';
import { getAppOnlyToken } from '@neram/auth';
import { postToConversation } from '@/lib/pad/bot/session-card';
import { FEATURE_FLAGS_KEY, isFeatureEnabled, resolveFlags } from '@/lib/feature-flags';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const DEFAULT_SERVICE_URL = 'https://smba.trafficmanager.net/teams/';
const TIMEOUT_MS = 10_000;

export interface AssistantConfig {
  /** The Neram Assistant app's id in the tenant catalogue. */
  catalogAppId: string;
  serviceUrl: string;
  tenantId: string;
}

type Env = Record<string, string | undefined>;

/**
 * Null when the server cannot reach the Assistant at all, which is a normal
 * state in local development and in preview builds.
 *
 * TEAMS_APP_CATALOG_ID is trimmed because a value added with `echo ... | vercel
 * env add` on Windows carries a trailing newline, and an app id with a newline
 * in it matches no app. That already bit the activity-feed tier.
 */
export function assistantConfig(env: Env = process.env): AssistantConfig | null {
  const catalogAppId = (env.TEAMS_APP_CATALOG_ID || '').trim();
  const tenantId = (env.AZ_TENANT_ID || '').trim();
  if (!catalogAppId || !tenantId) return null;
  let serviceUrl = (env.TEAMS_BOT_SERVICE_URL || DEFAULT_SERVICE_URL).trim();
  if (!serviceUrl.endsWith('/')) serviceUrl += '/';
  return { catalogAppId, serviceUrl, tenantId };
}

/**
 * Is the Assistant allowed to speak yet?
 *
 * Read per batch, never per recipient, and never cached in the module: the
 * founder switching this on from /teacher/admin/features has to take effect on
 * the next send, not on the next cold start. One row.
 *
 * Fails CLOSED. If the settings row cannot be read we do not know whether the
 * manifest has been approved, and guessing yes sends nothing at all (Graph
 * returns an install with no chat) while guessing no falls back to the activity
 * feed, which still reaches the student.
 */
export async function assistantEnabled(supabaseIn?: any): Promise<boolean> {
  try {
    const supabase = supabaseIn || (getSupabaseAdminClient() as any);
    const { data, error } = await supabase
      .from('nexus_settings')
      .select('value')
      .eq('key', FEATURE_FLAGS_KEY)
      .maybeSingle();
    if (error) return false;
    return isFeatureEnabled('staff.assistant-sender', resolveFlags((data?.value as Record<string, boolean>) || {}));
  } catch {
    return false;
  }
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

// -- Conversations -----------------------------------------------------------

export interface AssistantUser {
  id: string;
  ms_oid: string | null;
}

export interface AssistantDeps {
  fetch?: typeof fetch;
  supabase?: any;
  graphToken?: () => Promise<string>;
  config?: AssistantConfig | null;
  post?: typeof postToConversation;
}

export type ResolvedConversation =
  | { ok: true; conversationId: string; serviceUrl: string }
  | { ok: false; reason: string };

type GraphDeps = Required<Pick<AssistantDeps, 'fetch' | 'graphToken'>>;

async function graphCall(deps: GraphDeps, path: string, init: RequestInit = {}): Promise<Response> {
  const token = await deps.graphToken();
  return timedFetch(deps.fetch, `${GRAPH}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

async function findInstall(
  deps: GraphDeps,
  oid: string,
  catalogAppId: string,
): Promise<{ id: string; hasBot: boolean } | { error: string } | null> {
  const res = await graphCall(
    deps,
    `/users/${encodeURIComponent(oid)}/teamwork/installedApps?$expand=teamsApp,teamsAppDefinition($expand=bot)`,
  );
  // A 403 here is a missing permission, not "not installed". Say which.
  if (!res.ok) return { error: `Could not read Teams apps (${res.status})` };
  const data = await res.json().catch(() => null);
  const match = (data?.value || []).find(
    (a: any) => a?.teamsApp?.id === catalogAppId || a?.teamsApp?.externalId === catalogAppId,
  );
  if (!match) return null;
  return { id: match.id, hasBot: Boolean(match.teamsAppDefinition?.bot) };
}

/**
 * The student's 1:1 chat with the Assistant, installing the app for them if they
 * have never had it.
 *
 * Installing on their behalf is deliberate: a student who has to find and add an
 * app before their results reach them will not, and the whole point is that the
 * message arrives. It needs TeamsAppInstallation.ReadWriteForUser.All, which the
 * app registration already holds for the activity-feed tier.
 */
export async function resolveAssistantConversation(
  user: AssistantUser,
  depsIn: AssistantDeps = {},
): Promise<ResolvedConversation> {
  const cfg = depsIn.config === undefined ? assistantConfig() : depsIn.config;
  if (!cfg) return { ok: false, reason: 'Neram Assistant is not set up on this server' };
  if (!user.ms_oid) return { ok: false, reason: 'No Microsoft account on file' };
  const supabase = depsIn.supabase || (getSupabaseAdminClient() as any);
  const deps: GraphDeps = { fetch: depsIn.fetch || fetch, graphToken: depsIn.graphToken || getAppOnlyToken };

  const { data: cached } = await supabase
    .from('nexus_teams_assistant_conversations')
    .select('conversation_id, service_url')
    .eq('user_id', user.id)
    .maybeSingle();
  if (cached?.conversation_id) {
    return { ok: true, conversationId: cached.conversation_id, serviceUrl: cached.service_url || cfg.serviceUrl };
  }

  try {
    let install = await findInstall(deps, user.ms_oid, cfg.catalogAppId);
    if (install && 'error' in install) return { ok: false, reason: install.error };
    if (!install) {
      const res = await graphCall(deps, `/users/${encodeURIComponent(user.ms_oid)}/teamwork/installedApps`, {
        method: 'POST',
        body: JSON.stringify({ 'teamsApp@odata.bind': `${GRAPH}/appCatalogs/teamsApps/${cfg.catalogAppId}` }),
      });
      // 409 is "already installed", a race with another send rather than a failure.
      if (!res.ok && res.status !== 409) {
        return { ok: false, reason: `Could not install Neram Assistant (${res.status})` };
      }
      install = await findInstall(deps, user.ms_oid, cfg.catalogAppId);
      if (!install || 'error' in install) return { ok: false, reason: 'Neram Assistant did not install' };
    }
    if (!install.hasBot) {
      // Installed before the bot had a personal scope: move this user to the new
      // version. Without the upgrade Graph hands back an install with no chat.
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

    await supabase.from('nexus_teams_assistant_conversations').upsert(
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
    return { ok: false, reason: e instanceof Error ? e.message.slice(0, 180) : 'Neram Assistant lookup failed' };
  }
}

// -- Sending -----------------------------------------------------------------

/**
 * The teacher a message is from, when a person did something for this student
 * (reacted to a sketch, marked their work, typed a message).
 *
 * Founder, 2026-09-24: nothing is ever sent from a teacher's own Teams any more.
 * Two hundred students meant two hundred automated threads burying the real
 * conversations in the teacher's chat list. So the Assistant carries it, names
 * the teacher, and offers a "Message Hari" button. A personal chat only exists
 * when the student actually wants to talk.
 */
export interface AssistantFrom {
  name: string;
  /** The teacher's Microsoft sign-in address, for the chat deep link. No button without it. */
  email: string | null;
}

export interface AssistantCard {
  title: string;
  body: string;
  /** The page button. Optional: a teacher's note may carry only "Message Hari". */
  buttonLabel?: string;
  url?: string;
  from?: AssistantFrom | null;
  /**
   * A card the caller already built (the drawing review card, with the student's
   * own drawing on it). Used as the base instead of title and body; the "From"
   * line and the "Message" button are still added.
   */
  content?: Record<string, unknown> | null;
}

/** "Asha" from "Asha Bavi". */
function firstWord(name: string): string {
  return String(name || '').trim().split(/\s+/)[0] || name;
}

/** Opens a new or existing Teams 1:1 chat with this person. Microsoft's documented deep link. */
export function teamsChatDeepLink(email: string): string {
  return `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(email)}`;
}

/**
 * An Adaptive Card. Pure.
 *
 * Plain text only in the TextBlocks: Teams renders card text as a reduced
 * markdown, so an unescaped asterisk in a paper's title turns into italics.
 */
export function buildAssistantCard(c: AssistantCard): Record<string, unknown> {
  const base = (c.content as any) || null;
  const fromLine = c.from?.name
    ? [{ type: 'TextBlock', text: `From ${c.from.name}`, size: 'Small', isSubtle: true, wrap: true, spacing: 'None' }]
    : [];
  const body = base?.body
    ? [...fromLine, ...(base.body as unknown[])]
    : [
        ...fromLine,
        { type: 'TextBlock', text: c.title, weight: 'Bolder', size: 'Medium', wrap: true },
        { type: 'TextBlock', text: c.body, wrap: true, spacing: 'Small' },
      ];
  const actions: unknown[] = base?.actions
    ? [...(base.actions as unknown[])]
    : c.buttonLabel && c.url
      ? [{ type: 'Action.OpenUrl', title: c.buttonLabel, url: c.url }]
      : [];
  if (c.from?.email) {
    actions.push({ type: 'Action.OpenUrl', title: `Message ${firstWord(c.from.name)}`, url: teamsChatDeepLink(c.from.email) });
  }
  return {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      type: 'AdaptiveCard',
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      version: '1.4',
      body,
      ...(actions.length ? { actions } : {}),
    },
  };
}

export interface AssistantSendResult {
  ok: boolean;
  status: number;
  reason?: string;
}

/**
 * Post one message as Neram Assistant.
 *
 * A 403 or a 404 means the person removed the app or the chat is gone, so the
 * cached conversation is forgotten and the next send re-resolves it rather than
 * failing the same way for ever.
 */
export async function sendAssistantMessage(
  user: AssistantUser,
  message: { text: string; card?: AssistantCard },
  depsIn: AssistantDeps = {},
): Promise<AssistantSendResult> {
  const cfg = depsIn.config === undefined ? assistantConfig() : depsIn.config;
  if (!cfg) return { ok: false, status: 0, reason: 'Neram Assistant is not set up on this server' };
  const supabase = depsIn.supabase || (getSupabaseAdminClient() as any);

  const conv = await resolveAssistantConversation(user, { ...depsIn, config: cfg, supabase });
  if (!conv.ok) return { ok: false, status: 0, reason: conv.reason };

  const post = depsIn.post || postToConversation;
  const status = await post(
    { serviceUrl: conv.serviceUrl, conversationId: conv.conversationId },
    {
      type: 'message',
      text: message.text,
      textFormat: 'plain',
      ...(message.card ? { attachments: [buildAssistantCard(message.card)] } : {}),
    },
  );

  const table = () => supabase.from('nexus_teams_assistant_conversations');

  if (status >= 200 && status < 300) {
    try {
      await table().update({ last_sent_at: new Date().toISOString(), last_error: null }).eq('user_id', user.id);
    } catch {
      // Bookkeeping. The message landed, which is the part that matters.
    }
    return { ok: true, status };
  }

  const reason =
    status === 0 ? 'Neram Assistant could not reach Teams' : `Teams refused the Assistant message (${status})`;
  try {
    if (status === 403 || status === 404) await table().delete().eq('user_id', user.id);
    else await table().update({ last_error: reason }).eq('user_id', user.id);
  } catch {
    // As above: the reason still reaches the receipt.
  }
  return { ok: false, status, reason };
}

/**
 * The 1:1 conversation an inbound Teams activity belongs to, or null when the
 * activity is anything else (a meeting, a channel, the bot's own join).
 *
 * PURE, so the endpoint can stay about verification and this can be tested with
 * a literal. `from.aadObjectId` is the person, not the bot: on a personal
 * conversationUpdate the member ADDED is the bot itself (an id beginning 28:),
 * which is why the id is read off `from` rather than off membersAdded.
 */
export function personalConversationFrom(activity: Record<string, unknown>): {
  msOid: string;
  conversationId: string;
  serviceUrl: string;
  tenantId: string;
} | null {
  const rec = (v: unknown): Record<string, unknown> | null =>
    v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

  const conversation = rec(activity.conversation);
  if (str(conversation?.conversationType) !== 'personal') return null;

  const conversationId = str(conversation?.id);
  const serviceUrl = str(activity.serviceUrl);
  const msOid = str(rec(activity.from)?.aadObjectId);
  const tenantId = str(rec(rec(activity.channelData)?.tenant)?.id) || str(conversation?.tenantId);
  if (!conversationId || !msOid || !/^https:\/\//i.test(serviceUrl)) return null;

  return { msOid: msOid.toLowerCase(), conversationId, serviceUrl, tenantId };
}

/**
 * What the Assistant says when somebody talks back to it.
 *
 * It has to say something. Moving results off a teacher's personal chat means a
 * student who types "sir my mark is wrong" is now typing at a machine, and
 * silence there is worse than the personal chat we replaced. So it admits it
 * cannot read replies and names the two things that do work.
 */
export const ASSISTANT_REPLY =
  'I am Neram Assistant, and I cannot read replies. To answer a teacher, press the "Message" button on their note. To ask about a result, open it in Nexus and use "Something looks wrong".';

/**
 * Remember the conversation Teams just told us about.
 *
 * Teams sends a conversationUpdate the moment somebody adds the app, which hands
 * us the conversation id for free. Caching it here means the first real message
 * to that student costs no Graph calls at all.
 */
export async function rememberAssistantConversation(
  input: { msOid: string; conversationId: string; serviceUrl: string; tenantId: string },
  supabaseIn?: any,
): Promise<boolean> {
  const supabase = supabaseIn || (getSupabaseAdminClient() as any);
  const { data: user } = await supabase.from('users').select('id').eq('ms_oid', input.msOid).maybeSingle();
  if (!user?.id) return false;
  const { error } = await supabase.from('nexus_teams_assistant_conversations').upsert(
    {
      user_id: user.id,
      ms_oid: input.msOid,
      conversation_id: input.conversationId,
      service_url: input.serviceUrl,
      tenant_id: input.tenantId,
      source: 'conversation_update',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  return !error;
}
