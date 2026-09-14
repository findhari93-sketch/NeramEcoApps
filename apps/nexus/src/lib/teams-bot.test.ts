import { generateKeyPairSync, sign } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@neram/database', () => ({ getSupabaseAdminClient: () => ({}) }));
vi.mock('@neram/auth', () => ({ getAppOnlyToken: async () => 'graph-token' }));

import {
  botConfig,
  buildReminderCard,
  resetBotCaches,
  resolveBotConversation,
  sendBotMessage,
  verifyBotFrameworkJwt,
  type BotConfig,
  type BotJwk,
} from './teams-bot';

// ── JWT ─────────────────────────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' }) as { n: string; e: string; kty: string };
const KEYS: BotJwk[] = [{ kid: 'k1', kty: jwk.kty, n: jwk.n, e: jwk.e, endorsements: ['msteams'] }];
const NOW = 1_800_000_000_000;

const b64url = (v: object | Buffer) =>
  (Buffer.isBuffer(v) ? v : Buffer.from(JSON.stringify(v))).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

function token(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', kid: 'k1' }, key = privateKey) {
  const head = b64url(header);
  const body = b64url(claims);
  const sig = sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key);
  return `Bearer ${head}.${body}.${b64url(sig)}`;
}

const good = {
  iss: 'https://api.botframework.com',
  aud: 'app-id',
  exp: NOW / 1000 + 600,
  nbf: NOW / 1000 - 60,
  serviceurl: 'https://smba.trafficmanager.net/in/',
};
const activity = { serviceUrl: 'https://smba.trafficmanager.net/in/', channelId: 'msteams' };
const deps = { appId: 'app-id', now: NOW, loadKeys: async () => KEYS };

describe('verifyBotFrameworkJwt', () => {
  it('accepts a token Teams really signed', async () => {
    expect((await verifyBotFrameworkJwt(token(good), activity, deps)).ok).toBe(true);
  });

  it.each([
    ['no token', null, 'missing bearer token'],
    ['a wrong audience', token({ ...good, aud: 'someone-else' }), 'wrong audience'],
    ['a wrong issuer', token({ ...good, iss: 'https://evil.test' }), 'wrong issuer'],
    ['an expired token', token({ ...good, exp: NOW / 1000 - 3600 }), 'expired'],
    ['a service url that does not match the activity', token({ ...good, serviceurl: 'https://evil.test/' }), 'service url mismatch'],
    ['an unknown key', token(good, { alg: 'RS256', kid: 'nope' }), 'unknown signing key'],
    ['a forged signature', token(good, undefined, generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey), 'bad signature'],
    ['a none algorithm', token(good, { alg: 'none', kid: 'k1' }), 'unexpected algorithm'],
  ])('refuses %s', async (_label, header, reason) => {
    const r = await verifyBotFrameworkJwt(header as string | null, activity, deps);
    expect(r).toEqual({ ok: false, reason });
  });

  it('refuses a key not endorsed for Teams', async () => {
    const r = await verifyBotFrameworkJwt(token(good), { ...activity, channelId: 'webchat' }, deps);
    expect(r).toEqual({ ok: false, reason: 'key not endorsed for this channel' });
  });
});

// ── Config ──────────────────────────────────────────────────────────────────

describe('botConfig', () => {
  it('stays off until explicitly enabled, and trims Windows newlines', () => {
    const env = { AZ_CLIENT_ID: 'app\r\n', AZ_CLIENT_SECRET: 's', AZ_TENANT_ID: 't', TEAMS_APP_CATALOG_ID: 'cat\n' };
    expect(botConfig(env)).toBeNull();
    expect(botConfig({ ...env, TEAMS_BOT_ENABLED: '1' })).toMatchObject({
      appId: 'app', catalogAppId: 'cat', serviceUrl: 'https://smba.trafficmanager.net/teams/',
    });
  });
});

// ── Conversations and sending ───────────────────────────────────────────────

const CFG: BotConfig = { appId: 'app-id', secret: 's', tenantId: 'tenant', serviceUrl: 'https://smba.test/teams/', catalogAppId: 'cat-1' };

function fakeSupabase(cached: Record<string, unknown> | null = null) {
  const ops: Array<{ op: string; table: string; row?: unknown }> = [];
  const chain = (table: string): any => {
    const c: any = {
      select: () => c,
      eq: () => c,
      maybeSingle: async () => ({ data: cached, error: null }),
      upsert: async (row: unknown) => { ops.push({ op: 'upsert', table, row }); return { error: null }; },
      update: (row: unknown) => { ops.push({ op: 'update', table, row }); return c; },
      delete: () => { ops.push({ op: 'delete', table }); return c; },
      then: (res: any) => Promise.resolve({ error: null }).then(res),
    };
    return c;
  };
  return { client: { from: chain }, ops };
}

function fakeFetch(routes: Array<[RegExp, (init?: RequestInit) => { status: number; body?: unknown }]>) {
  const calls: Array<{ url: string; method: string }> = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method || 'GET' });
    const route = routes.find(([re]) => re.test(url));
    const r = route ? route[1](init) : { status: 404 };
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

beforeEach(() => resetBotCaches());

describe('resolveBotConversation', () => {
  const user = { id: 'u1', ms_oid: 'oid-1' };

  it('uses the cached conversation without calling Graph', async () => {
    const db = fakeSupabase({ conversation_id: '19:cached', service_url: 'https://smba.test/in/' });
    const net = fakeFetch([]);
    const r = await resolveBotConversation(user, { config: CFG, supabase: db.client, fetch: net.impl });
    expect(r).toEqual({ ok: true, conversationId: '19:cached', serviceUrl: 'https://smba.test/in/' });
    expect(net.calls).toHaveLength(0);
  });

  it('upgrades an install that predates the bot, then caches the chat id', async () => {
    const db = fakeSupabase(null);
    const net = fakeFetch([
      [/installedApps\?\$expand/, () => ({ status: 200, body: { value: [{ id: 'inst-1', teamsApp: { id: 'cat-1' }, teamsAppDefinition: { bot: null } }] } })],
      [/inst-1\/upgrade$/, () => ({ status: 204 })],
      [/inst-1\/chat$/, () => ({ status: 200, body: { id: '19:chat-1' } })],
    ]);
    const r = await resolveBotConversation(user, { config: CFG, supabase: db.client, fetch: net.impl, graphToken: async () => 'g' });
    expect(r).toEqual({ ok: true, conversationId: '19:chat-1', serviceUrl: CFG.serviceUrl });
    expect(net.calls.map((c) => c.method)).toEqual(['GET', 'POST', 'GET']);
    expect(db.ops[0]).toMatchObject({ op: 'upsert', table: 'nexus_teams_bot_conversations' });
  });

  it('says a 403 on reading apps is a permission problem, not "not installed"', async () => {
    const db = fakeSupabase(null);
    const net = fakeFetch([[/installedApps/, () => ({ status: 403 })]]);
    const r = await resolveBotConversation(user, { config: CFG, supabase: db.client, fetch: net.impl, graphToken: async () => 'g' });
    expect(r).toEqual({ ok: false, reason: 'Could not read Teams apps (403)' });
  });

  it('refuses a student with no Microsoft account', async () => {
    const r = await resolveBotConversation({ id: 'u2', ms_oid: null }, { config: CFG, supabase: fakeSupabase().client });
    expect(r).toEqual({ ok: false, reason: 'No Microsoft account on file' });
  });
});

describe('sendBotMessage', () => {
  it('posts into the conversation and forgets it when Teams says it is gone', async () => {
    const db = fakeSupabase({ conversation_id: '19:old', service_url: CFG.serviceUrl });
    const net = fakeFetch([
      [/oauth2\/v2.0\/token/, () => ({ status: 200, body: { access_token: 'bot', expires_in: 3600 } })],
      [/v3\/conversations/, () => ({ status: 404, body: { error: 'gone' } })],
    ]);
    const r = await sendBotMessage({ id: 'u1', ms_oid: 'oid-1' }, { text: 'Hi' }, { config: CFG, supabase: db.client, fetch: net.impl });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(404);
    expect(db.ops.some((o) => o.op === 'delete')).toBe(true);
  });
});

describe('buildReminderCard', () => {
  it('is an Adaptive Card with one open-url button', () => {
    const card = buildReminderCard({ title: 'T', body: 'B', buttonLabel: 'Add a sketch', url: 'https://x.test' }) as any;
    expect(card.contentType).toBe('application/vnd.microsoft.card.adaptive');
    expect(card.content.actions).toEqual([{ type: 'Action.OpenUrl', title: 'Add a sketch', url: 'https://x.test' }]);
  });
});
