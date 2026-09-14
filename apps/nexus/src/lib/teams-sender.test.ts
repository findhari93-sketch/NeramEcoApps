import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@neram/database', () => ({ getSupabaseAdminClient: () => ({}) }));

import {
  SENDER_SCOPES,
  buildSenderAuthorizeUrl,
  classroomSenders,
  getSenderAccessToken,
  newSenderState,
  renewSenders,
  safeReturnPath,
  senderAppConfig,
  senderRedirectUri,
  signSenderState,
  verifySenderState,
  type SenderAppConfig,
} from './teams-sender';
import { teacherChatFrom } from './nudge-delivery';

const CFG: SenderAppConfig = { clientId: 'app-id', clientSecret: 'secret', tenantId: 'tenant' };
const NOW = 1_800_000_000_000;

/** A tiny PostgREST stand-in: one table, rows, and a log of updates. */
function fakeDb(tables: Record<string, any[]>) {
  const updates: Array<{ table: string; patch: any }> = [];
  const from = (table: string) => {
    let rows = [...(tables[table] || [])];
    const chain: any = {
      select: () => chain,
      eq: (col: string, val: unknown) => ((rows = rows.filter((r) => r[col] === val)), chain),
      in: (col: string, vals: unknown[]) => ((rows = rows.filter((r) => vals.includes(r[col]))), chain),
      is: (col: string, val: unknown) => ((rows = rows.filter((r) => (r[col] ?? null) === val)), chain),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      update: (patch: any) => {
        updates.push({ table, patch });
        return { eq: async () => ({ error: null }) };
      },
      then: (res: any) => Promise.resolve({ data: rows, error: null }).then(res),
    };
    return chain;
  };
  return { client: { from }, updates };
}

function tokenFetch(response: { status: number; body: unknown }) {
  const calls: Array<{ url: string; body: string }> = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: String(init?.body || '') });
    return new Response(JSON.stringify(response.body), { status: response.status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('state cookie', () => {
  it('round-trips, and refuses a tampered, expired or foreign cookie', () => {
    const state = newSenderState('u1', 'c1', '/teacher/sketchbook?view=rhythm', NOW);
    const cookie = signSenderState(state, 'secret');
    expect(verifySenderState(cookie, 'secret', NOW + 1000)).toEqual(state);
    expect(verifySenderState(cookie, 'other-secret', NOW)).toBeNull();
    expect(verifySenderState(cookie, 'secret', NOW + 11 * 60_000)).toBeNull();
    const [body, mac] = cookie.split('.');
    const forged = Buffer.from(JSON.stringify({ ...state, u: 'someone-else' })).toString('base64url');
    expect(verifySenderState(`${forged}.${mac}`, 'secret', NOW)).toBeNull();
    expect(verifySenderState(`${body}`, 'secret', NOW)).toBeNull();
  });

  it('only ever returns to a path inside Nexus', () => {
    expect(safeReturnPath('/teacher/sketchbook?view=rhythm')).toBe('/teacher/sketchbook?view=rhythm');
    expect(safeReturnPath('https://evil.test')).toBe('/teacher/sketchbook?view=rhythm');
    expect(safeReturnPath('//evil.test/x')).toBe('/teacher/sketchbook?view=rhythm');
  });
});

describe('Microsoft sign-in', () => {
  it('asks only for profile and chat sending, and a refresh token', () => {
    const url = new URL(buildSenderAuthorizeUrl(CFG, { redirectUri: 'https://nexus.test/api/teams/sender/callback', state: 's1' }));
    expect(url.pathname).toBe('/tenant/oauth2/v2.0/authorize');
    expect(url.searchParams.get('scope')!.split(' ').sort()).toEqual([...SENDER_SCOPES].sort());
    expect(SENDER_SCOPES).toContain('offline_access');
    expect(SENDER_SCOPES).toContain('ChatMessage.Send');
    expect(url.searchParams.get('state')).toBe('s1');
  });

  it('uses the configured Nexus URL for the redirect, and trims Windows newlines from settings', () => {
    expect(senderRedirectUri('http://localhost:3012', { NEXT_PUBLIC_NEXUS_URL: 'https://nexus.neramclasses.com/' })).toBe(
      'https://nexus.neramclasses.com/api/teams/sender/callback',
    );
    expect(senderRedirectUri('http://localhost:3012', {})).toBe('http://localhost:3012/api/teams/sender/callback');
    expect(senderAppConfig({ AZ_CLIENT_ID: 'a\r\n', AZ_CLIENT_SECRET: 's', AZ_TENANT_ID: 't' })).toEqual({ clientId: 'a', clientSecret: 's', tenantId: 't' });
    expect(senderAppConfig({})).toBeNull();
  });
});

describe('getSenderAccessToken', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    user_id: 'u1', ms_oid: 'oid', display_name: 'Hari', refresh_token: 'rt-old',
    access_token: 'at-cached', access_token_expires_at: new Date(NOW + 30 * 60_000).toISOString(),
    last_refreshed_at: null, revoked_at: null, ...over,
  });

  it('reuses a fresh cached token without calling Microsoft', async () => {
    const db = fakeDb({ nexus_teams_senders: [row()] });
    const net = tokenFetch({ status: 500, body: {} });
    expect(await getSenderAccessToken('u1', { supabase: db.client, fetch: net.impl, config: CFG, now: NOW })).toBe('at-cached');
    expect(net.calls).toHaveLength(0);
  });

  it('renews a stale token and keeps the rotated refresh token', async () => {
    const db = fakeDb({ nexus_teams_senders: [row({ access_token_expires_at: new Date(NOW - 1000).toISOString() })] });
    const net = tokenFetch({ status: 200, body: { access_token: 'at-new', refresh_token: 'rt-new', expires_in: 3600, scope: 'ChatMessage.Send' } });
    expect(await getSenderAccessToken('u1', { supabase: db.client, fetch: net.impl, config: CFG, now: NOW })).toBe('at-new');
    expect(net.calls[0].body).toContain('grant_type=refresh_token');
    expect(net.calls[0].body).toContain('client_secret=secret');
    expect(db.updates[0].patch).toMatchObject({ access_token: 'at-new', refresh_token: 'rt-new', last_error: null });
  });

  it('marks the connection stopped when Microsoft says the grant is dead', async () => {
    const db = fakeDb({ nexus_teams_senders: [row({ access_token: null })] });
    const net = tokenFetch({ status: 400, body: { error: 'invalid_grant', error_description: 'AADSTS70043: expired' } });
    await expect(getSenderAccessToken('u1', { supabase: db.client, fetch: net.impl, config: CFG, now: NOW })).rejects.toMatchObject({ revoked: true });
    expect(db.updates[0].patch.revoked_at).toBeTruthy();
  });

  it('says so when the teacher never connected, or stopped', async () => {
    await expect(getSenderAccessToken('nobody', { supabase: fakeDb({}).client, config: CFG })).rejects.toThrow('has not connected Teams');
    const revoked = fakeDb({ nexus_teams_senders: [row({ revoked_at: '2026-09-01' })] });
    await expect(getSenderAccessToken('u1', { supabase: revoked.client, config: CFG })).rejects.toThrow('needs reconnecting');
  });
});

describe('renewSenders', () => {
  it('renews only logins not renewed in the last day, and reports the ones that died', async () => {
    const db = fakeDb({
      nexus_teams_senders: [
        { user_id: 'fresh', refresh_token: 'a', last_refreshed_at: new Date(NOW - 3600_000).toISOString(), revoked_at: null },
        { user_id: 'stale', refresh_token: 'b', last_refreshed_at: new Date(NOW - 30 * 3600_000).toISOString(), revoked_at: null },
      ],
    });
    const net = tokenFetch({ status: 400, body: { error: 'invalid_grant' } });
    const out = await renewSenders({ supabase: db.client, fetch: net.impl, config: CFG, now: NOW });
    expect(net.calls).toHaveLength(1);
    expect(out.failed).toEqual([{ userId: 'stale', reason: 'invalid_grant', revoked: true }]);
  });
});

describe('classroomSenders', () => {
  it('names the connected teacher of each class, and nobody when their login stopped', async () => {
    const db = fakeDb({
      nexus_classrooms: [{ id: 'c1', reminder_sender_id: 'u1' }, { id: 'c2', reminder_sender_id: 'u2' }, { id: 'c3', reminder_sender_id: null }],
      nexus_teams_senders: [{ user_id: 'u1', display_name: 'Hari', revoked_at: null }, { user_id: 'u2', display_name: 'Anu', revoked_at: '2026-09-01' }],
    });
    expect(await classroomSenders(['c1', 'c2', 'c3'], db.client)).toEqual({ c1: { userId: 'u1', name: 'Hari' }, c2: null, c3: null });
  });
});

describe('teacherChatFrom', () => {
  it('uses a real Microsoft token and never Nexus test, impersonation or parent tokens', () => {
    expect(teacherChatFrom('Bearer eyJreal', '<p>Hi</p>')).toEqual({ delegatedToken: 'eyJreal', html: '<p>Hi</p>' });
    for (const t of ['test_abc', 'imp_abc', 'par_abc']) expect(teacherChatFrom(`Bearer ${t}`, '<p>Hi</p>')).toBeUndefined();
    expect(teacherChatFrom(null, '<p>Hi</p>')).toBeUndefined();
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});
