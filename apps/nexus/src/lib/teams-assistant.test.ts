import { describe, it, expect, vi } from 'vitest';
import {
  assistantConfig,
  buildAssistantCard,
  personalConversationFrom,
  resolveAssistantConversation,
  sendAssistantMessage,
  ASSISTANT_REPLY,
} from './teams-assistant';

const CFG = { catalogAppId: 'cat-1', serviceUrl: 'https://smba.example/teams/', tenantId: 'tenant-1' };

/** A Supabase double that records what it was asked to do. */
function db(cached: Record<string, unknown> | null = null) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  const chain = (table: string) => ({
    select: () => chain(table),
    eq: () => chain(table),
    maybeSingle: async () => ({ data: cached }),
    upsert: async (payload: unknown) => {
      calls.push({ table, op: 'upsert', payload });
      return { error: null };
    },
    update: (payload: unknown) => {
      calls.push({ table, op: 'update', payload });
      return { eq: async () => ({ error: null }) };
    },
    delete: () => {
      calls.push({ table, op: 'delete' });
      return { eq: async () => ({ error: null }) };
    },
  });
  return { client: { from: (table: string) => chain(table) } as any, calls };
}

describe('assistantConfig', () => {
  it('is null when the server cannot reach the Assistant, which is normal locally', () => {
    expect(assistantConfig({})).toBeNull();
    expect(assistantConfig({ TEAMS_APP_CATALOG_ID: 'x' })).toBeNull();
    expect(assistantConfig({ AZ_TENANT_ID: 't' })).toBeNull();
  });

  // A value added with `echo ... | vercel env add` on Windows carries a trailing
  // newline, and an app id with a newline in it matches no app. That has already
  // bitten the activity-feed tier.
  it('trims a value pasted in with a trailing newline', () => {
    const cfg = assistantConfig({ TEAMS_APP_CATALOG_ID: 'cat-1\n', AZ_TENANT_ID: ' tenant-1 ' });
    expect(cfg).toEqual({ catalogAppId: 'cat-1', serviceUrl: 'https://smba.trafficmanager.net/teams/', tenantId: 'tenant-1' });
  });

  it('always ends the service url with a slash, because the post path is appended to it', () => {
    expect(assistantConfig({ TEAMS_APP_CATALOG_ID: 'c', AZ_TENANT_ID: 't', TEAMS_BOT_SERVICE_URL: 'https://a/b' })?.serviceUrl).toBe(
      'https://a/b/',
    );
  });
});

describe('resolveAssistantConversation', () => {
  it('uses the cached conversation without touching Graph', async () => {
    const graphToken = vi.fn();
    const { client } = db({ conversation_id: '19:abc', service_url: 'https://cached/' });
    const out = await resolveAssistantConversation(
      { id: 'u1', ms_oid: 'oid-1' },
      { config: CFG, supabase: client, graphToken, fetch: vi.fn() as never },
    );
    expect(out).toEqual({ ok: true, conversationId: '19:abc', serviceUrl: 'https://cached/' });
    expect(graphToken).not.toHaveBeenCalled();
  });

  it('refuses without a Microsoft account, in words a teacher can act on', async () => {
    const { client } = db();
    const out = await resolveAssistantConversation({ id: 'u1', ms_oid: null }, { config: CFG, supabase: client });
    expect(out).toEqual({ ok: false, reason: 'No Microsoft account on file' });
  });

  it('refuses, rather than throwing, when the Assistant is not set up here', async () => {
    const out = await resolveAssistantConversation({ id: 'u1', ms_oid: 'oid-1' }, { config: null });
    expect(out.ok).toBe(false);
  });

  // A 403 on the install list is a MISSING PERMISSION, not "not installed", and
  // installing over the top of it would hide the real problem.
  it('reports a refused install list instead of trying to install', async () => {
    const { client } = db();
    const fetchImpl = vi.fn(async () => new Response('no', { status: 403 }));
    const out = await resolveAssistantConversation(
      { id: 'u1', ms_oid: 'oid-1' },
      { config: CFG, supabase: client, graphToken: async () => 't', fetch: fetchImpl as never },
    );
    expect(out).toEqual({ ok: false, reason: 'Could not read Teams apps (403)' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('installs the app for a student who has never had it, then caches the chat', async () => {
    const { client, calls } = db();
    let step = 0;
    const fetchImpl = vi.fn(async () => {
      step += 1;
      if (step === 1) return Response.json({ value: [] }); // not installed
      if (step === 2) return new Response(null, { status: 201 }); // installed
      if (step === 3) return Response.json({ value: [{ id: 'inst-1', teamsApp: { id: 'cat-1' }, teamsAppDefinition: { bot: {} } }] });
      return Response.json({ id: '19:new' });
    });
    const out = await resolveAssistantConversation(
      { id: 'u1', ms_oid: 'oid-1' },
      { config: CFG, supabase: client, graphToken: async () => 't', fetch: fetchImpl as never },
    );
    expect(out).toEqual({ ok: true, conversationId: '19:new', serviceUrl: CFG.serviceUrl });
    expect(calls.some((c) => c.table === 'nexus_teams_assistant_conversations' && c.op === 'upsert')).toBe(true);
  });

  // Installed before the bot had a personal scope. Without the upgrade Graph
  // hands back an install with no chat, which is exactly the state every
  // existing student is in until the new manifest is approved.
  it('upgrades an install that predates the bot', async () => {
    const { client } = db();
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      seen.push(String(url));
      if (String(url).includes('installedApps?')) {
        return Response.json({ value: [{ id: 'inst-1', teamsApp: { id: 'cat-1' }, teamsAppDefinition: {} }] });
      }
      if (String(url).endsWith('/upgrade')) return new Response(null, { status: 204 });
      return Response.json({ id: '19:up' });
    });
    const out = await resolveAssistantConversation(
      { id: 'u1', ms_oid: 'oid-1' },
      { config: CFG, supabase: client, graphToken: async () => 't', fetch: fetchImpl as never },
    );
    expect(out.ok).toBe(true);
    expect(seen.some((u) => u.endsWith('/upgrade'))).toBe(true);
  });
});

describe('sendAssistantMessage', () => {
  const cached = { conversation_id: '19:abc', service_url: 'https://smba.example/teams/' };

  it('sends a card with one button when a link is given, and no duplicate text', async () => {
    const { client } = db(cached);
    const post = vi.fn(async (_target: unknown, _activity: unknown) => 201);
    const out = await sendAssistantMessage(
      { id: 'u1', ms_oid: 'oid-1' },
      { text: '', card: { title: 'Results are out', body: 'Tap to see yours.', buttonLabel: 'See my result', url: 'https://n/x' } },
      { config: CFG, supabase: client, post: post as never },
    );
    expect(out.ok).toBe(true);
    const activity = post.mock.calls[0][1] as any;
    expect(activity.text).toBe('');
    expect(activity.attachments).toHaveLength(1);
  });

  // Removed the app, or the chat is gone. Forgetting the cached conversation is
  // what stops it failing the same way for ever.
  it('forgets the conversation on a 403 so the next send re-resolves it', async () => {
    const { client, calls } = db(cached);
    const out = await sendAssistantMessage(
      { id: 'u1', ms_oid: 'oid-1' },
      { text: 'hello' },
      { config: CFG, supabase: client, post: (async () => 403) as never },
    );
    expect(out.ok).toBe(false);
    expect(calls.some((c) => c.op === 'delete')).toBe(true);
  });

  it('keeps the conversation on a transient failure, and records why', async () => {
    const { client, calls } = db(cached);
    const out = await sendAssistantMessage(
      { id: 'u1', ms_oid: 'oid-1' },
      { text: 'hello' },
      { config: CFG, supabase: client, post: (async () => 429) as never },
    );
    expect(out.ok).toBe(false);
    expect(calls.some((c) => c.op === 'delete')).toBe(false);
    expect(calls.some((c) => c.op === 'update')).toBe(true);
  });

  it('never throws, whatever Teams does', async () => {
    const { client } = db(cached);
    const out = await sendAssistantMessage(
      { id: 'u1', ms_oid: 'oid-1' },
      { text: 'hello' },
      { config: CFG, supabase: client, post: (async () => 0) as never },
    );
    expect(out.ok).toBe(false);
    expect(out.reason).toContain('could not reach Teams');
  });
});

describe('personalConversationFrom', () => {
  const activity = {
    type: 'message',
    serviceUrl: 'https://smba.example/teams/',
    conversation: { conversationType: 'personal', id: '19:1on1' },
    from: { aadObjectId: 'OID-1' },
    channelData: { tenant: { id: 'tenant-1' } },
  };

  it('reads the person off `from`, not off membersAdded', () => {
    // On a personal conversationUpdate the member ADDED is the bot itself.
    expect(personalConversationFrom({ ...activity, membersAdded: [{ id: '28:bot' }] })).toEqual({
      msOid: 'oid-1',
      conversationId: '19:1on1',
      serviceUrl: 'https://smba.example/teams/',
      tenantId: 'tenant-1',
    });
  });

  it('ignores a meeting or a channel, which the Answer Pad owns', () => {
    expect(personalConversationFrom({ ...activity, conversation: { conversationType: 'channel', id: '19:chan' } })).toBeNull();
  });

  it('ignores an activity with no person on it', () => {
    expect(personalConversationFrom({ ...activity, from: {} })).toBeNull();
  });

  it('ignores a non-https service url, which is never sent a token', () => {
    expect(personalConversationFrom({ ...activity, serviceUrl: 'http://evil.example/' })).toBeNull();
  });
});

describe('what the Assistant says back', () => {
  // A student typing "sir my mark is wrong" at a machine and getting silence is
  // worse than the personal chat this replaced.
  it('admits it cannot read replies and names what does work', () => {
    expect(ASSISTANT_REPLY).toContain('cannot read replies');
    expect(ASSISTANT_REPLY).toContain('Something looks wrong');
    expect(ASSISTANT_REPLY).toContain('teacher');
  });

  it('uses no em dash, because a student reads it', () => {
    expect(ASSISTANT_REPLY).not.toMatch(/—|--|&mdash;/);
  });
});

describe('buildAssistantCard', () => {
  it('puts the title, the body and exactly one button on the card', () => {
    const card = buildAssistantCard({ title: 'T', body: 'B', buttonLabel: 'Go', url: 'https://n/x' }) as any;
    expect(card.content.body.map((b: any) => b.text)).toEqual(['T', 'B']);
    expect(card.content.actions).toEqual([{ type: 'Action.OpenUrl', title: 'Go', url: 'https://n/x' }]);
  });

  it('wraps long text rather than letting Teams clip it', () => {
    const card = buildAssistantCard({ title: 'T', body: 'B', buttonLabel: 'Go', url: 'https://n/x' }) as any;
    expect(card.content.body.every((b: any) => b.wrap === true)).toBe(true);
  });
});
