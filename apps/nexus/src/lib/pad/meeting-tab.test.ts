// @vitest-environment node
import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import {
  PAD_RSC_PERMISSIONS,
  consentedPermissionSet,
  ensureAnswerPadInMeeting,
  meetingChatIdFromJoinUrl,
} from './meeting-tab';
import { answerPadTab } from './teams-tab';

const CHAT = '19:meeting_NjY3ZTk0YmItZDc4@thread.v2';
const JOIN = `https://teams.microsoft.com/l/meetup-join/${encodeURIComponent(CHAT)}/0?context=%7b%22Tid%22%3a%22t%22%2c%22Oid%22%3a%22o%22%7d`;
const CHANNEL_JOIN = `https://teams.microsoft.com/l/meetup-join/${encodeURIComponent('19:4f2a8c@thread.tacv2')}/1784526278019?context=%7b%7d`;
const CATALOG = '2b524e28-95ce-4c9b-9773-4a5bd6ec1770';
const ORIGIN = 'https://nexus.neramclasses.com';
const INPUT = { joinUrl: JOIN, catalogAppId: CATALOG, origin: ORIGIN };
const token = async () => 'graph-token';

const json = (status: number, body: unknown) => () =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const empty = (status: number) => () => new Response(null, { status });
const ours = { value: [{ id: 'x', teamsApp: { id: CATALOG, externalId: 'df4f6b2d-ea18-46d1-8934-f508ac248e6c' } }] };
const others = { value: [{ id: 'y', teamsApp: { id: '11111111-2222-3333-4444-555555555555' } }] };

/** A fake Graph keyed by "METHOD /path", which fails the test on any call it was not told about. */
function graph(routes: Record<string, () => Response>) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${String(url).replace('https://graph.microsoft.com/v1.0', '')}`;
    const route = routes[key];
    if (!route) throw new Error(`unexpected Graph call: ${key}`);
    return route();
  });
}

const TABS = `GET /chats/${CHAT}/tabs?$expand=teamsApp`;
const APPS = `GET /chats/${CHAT}/installedApps?$expand=teamsApp`;
const INSTALL = `POST /chats/${CHAT}/installedApps`;
const PIN = `POST /chats/${CHAT}/tabs`;

const bodyOf = (fetchImpl: ReturnType<typeof graph>, key: string) => {
  const call = fetchImpl.mock.calls.find(([url, init]) => `${init?.method ?? 'GET'} ${String(url).replace('https://graph.microsoft.com/v1.0', '')}` === key);
  return call ? JSON.parse(String(call[1]?.body)) : undefined;
};

describe('meetingChatIdFromJoinUrl', () => {
  it('finds the meeting chat in a join link, encoded or not', () => {
    expect(meetingChatIdFromJoinUrl(JOIN)).toBe(CHAT);
    expect(meetingChatIdFromJoinUrl(`https://teams.microsoft.com/l/meetup-join/${CHAT}/0`)).toBe(CHAT);
  });

  it('refuses channel meetings and anything that is not a meeting link', () => {
    expect(meetingChatIdFromJoinUrl(CHANNEL_JOIN)).toBeNull();
    expect(meetingChatIdFromJoinUrl(null)).toBeNull();
    expect(meetingChatIdFromJoinUrl('')).toBeNull();
    expect(meetingChatIdFromJoinUrl('https://example.com/not-teams')).toBeNull();
    expect(meetingChatIdFromJoinUrl('https://teams.microsoft.com/l/meetup-join/19%3a..%2f..%2fusers%40thread.v2/0')).toBeNull();
  });
});

describe('the consent set', () => {
  it('is exactly the manifest resource-specific permissions, so Teams accepts the install', () => {
    const manifest = JSON.parse(readFileSync(path.resolve(__dirname, '../../../teams-app/manifest.json'), 'utf-8'));
    expect(PAD_RSC_PERMISSIONS).toEqual(manifest.authorization.permissions.resourceSpecific);
    expect(consentedPermissionSet().resourceSpecificPermissions).toEqual(
      manifest.authorization.permissions.resourceSpecific.map((p: { name: string; type: string }) => ({
        permissionValue: p.name,
        permissionType: p.type,
      })),
    );
  });
});

describe('ensureAnswerPadInMeeting', () => {
  it('does nothing when the pad is already pinned, however it got there', async () => {
    const fetchImpl = graph({ [TABS]: json(200, ours) });
    await expect(ensureAnswerPadInMeeting(INPUT, { token, fetchImpl })).resolves.toEqual({ outcome: 'already', chatId: CHAT });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('installs the app with its consent set, then pins the same tab the configuration page saves', async () => {
    const fetchImpl = graph({
      [TABS]: json(200, others),
      [APPS]: json(200, others),
      [INSTALL]: empty(201),
      [PIN]: json(201, { id: 'tab-1' }),
    });

    await expect(ensureAnswerPadInMeeting(INPUT, { token, fetchImpl })).resolves.toEqual({ outcome: 'added', chatId: CHAT });

    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({ Authorization: 'Bearer graph-token' });
    expect(bodyOf(fetchImpl, INSTALL)).toEqual({
      'teamsApp@odata.bind': `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/${CATALOG}`,
      consentedPermissionSet: consentedPermissionSet(),
    });
    const tab = answerPadTab(ORIGIN);
    expect(bodyOf(fetchImpl, PIN)).toEqual({
      displayName: 'Answer Pad',
      'teamsApp@odata.bind': `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/${CATALOG}`,
      configuration: { entityId: 'answer-pad', contentUrl: tab.contentUrl, websiteUrl: tab.websiteUrl },
    });
  });

  it('only pins the tab when the app is installed but its tab was removed', async () => {
    const fetchImpl = graph({ [TABS]: json(200, { value: [] }), [APPS]: json(200, ours), [PIN]: json(201, {}) });
    await expect(ensureAnswerPadInMeeting(INPUT, { token, fetchImpl })).resolves.toMatchObject({ outcome: 'added' });
    expect(bodyOf(fetchImpl, INSTALL)).toBeUndefined();
  });

  it('retries without a consent set when Graph refuses the full one, as it does for the bot-free Neram Pad Dev', async () => {
    const installs = [json(400, { error: { code: 'BadRequest', message: 'Permissions do not match' } }), empty(201)];
    const fetchImpl = graph({
      [TABS]: json(200, { value: [] }),
      [APPS]: json(200, { value: [] }),
      [INSTALL]: () => installs.shift()!(),
      [PIN]: json(201, {}),
    });

    await expect(ensureAnswerPadInMeeting(INPUT, { token, fetchImpl })).resolves.toEqual({ outcome: 'added', chatId: CHAT });

    const bodies = fetchImpl.mock.calls
      .filter(([url, init]) => init?.method === 'POST' && String(url).endsWith('/installedApps'))
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies).toEqual([
      { 'teamsApp@odata.bind': `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/${CATALOG}`, consentedPermissionSet: consentedPermissionSet() },
      { 'teamsApp@odata.bind': `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/${CATALOG}` },
    ]);
  });

  it('fails when the retry without a consent set is refused too, and tries no third time', async () => {
    const fetchImpl = graph({
      [TABS]: json(200, { value: [] }),
      [APPS]: json(200, { value: [] }),
      [INSTALL]: json(400, { error: { message: 'Consent required' } }),
    });
    const result = await ensureAnswerPadInMeeting(INPUT, { token, fetchImpl });
    expect(result).toMatchObject({ outcome: 'failed', reason: expect.stringContaining('install the app: 400') });
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2);
  });

  it('carries on when an overlapping run installed the app a moment earlier', async () => {
    const fetchImpl = graph({ [TABS]: json(200, { value: [] }), [APPS]: json(200, { value: [] }), [INSTALL]: empty(409), [PIN]: json(201, {}) });
    await expect(ensureAnswerPadInMeeting(INPUT, { token, fetchImpl })).resolves.toMatchObject({ outcome: 'added' });
  });

  it('reports a chat that does not answer yet as not ready, and writes nothing', async () => {
    const fetchImpl = graph({ [TABS]: json(404, { error: { code: 'NotFound', message: 'Chat not found' } }) });
    const result = await ensureAnswerPadInMeeting(INPUT, { token, fetchImpl });
    expect(result).toMatchObject({ outcome: 'chat_not_ready', chatId: CHAT });
    expect(result.reason).toContain('list tabs: 404');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reports a 403 as missing permissions, with the step and Graph message for the logs', async () => {
    const fetchImpl = graph({
      [TABS]: json(200, { value: [] }),
      [APPS]: json(200, { value: [] }),
      [INSTALL]: json(403, { error: { code: 'Forbidden', message: 'Missing role permissions' } }),
    });
    const result = await ensureAnswerPadInMeeting(INPUT, { token, fetchImpl });
    expect(result.outcome).toBe('permission_missing');
    expect(result.reason).toMatch(/^install the app: 403 .*Missing role permissions/);
    expect(result.reason).not.toContain('graph-token');
    // Only a 400 earns the retry without a consent set.
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('treats a 404 after the chat answered as a failure, not a chat that is not ready', async () => {
    const fetchImpl = graph({ [TABS]: json(200, { value: [] }), [APPS]: json(200, { value: [] }), [INSTALL]: json(404, { error: { message: 'App not found' } }) });
    await expect(ensureAnswerPadInMeeting(INPUT, { token, fetchImpl })).resolves.toMatchObject({ outcome: 'failed' });
  });

  it('fails a refused tab without throwing', async () => {
    const fetchImpl = graph({ [TABS]: json(200, { value: [] }), [APPS]: json(200, ours), [PIN]: json(400, { error: { message: 'Bad tab' } }) });
    await expect(ensureAnswerPadInMeeting(INPUT, { token, fetchImpl })).resolves.toMatchObject({ outcome: 'failed', reason: expect.stringContaining('add the tab: 400') });
  });

  it('never throws on a dropped connection or a missing token', async () => {
    const dropped = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(ensureAnswerPadInMeeting(INPUT, { token, fetchImpl: dropped })).resolves.toMatchObject({ outcome: 'failed', reason: expect.stringContaining('fetch failed') });

    const fetchImpl = graph({});
    const noToken = async () => {
      throw new Error('AZ_CLIENT_SECRET is required');
    };
    await expect(ensureAnswerPadInMeeting(INPUT, { token: noToken, fetchImpl })).resolves.toMatchObject({ outcome: 'failed', reason: expect.stringContaining('no Graph token') });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('calls nothing for a channel meeting, a bad catalog id or a tab origin that is not https', async () => {
    const fetchImpl = graph({});
    await expect(ensureAnswerPadInMeeting({ ...INPUT, joinUrl: CHANNEL_JOIN }, { token, fetchImpl })).resolves.toEqual({ outcome: 'not_meeting_chat', chatId: null });
    await expect(ensureAnswerPadInMeeting({ ...INPUT, catalogAppId: "x'/../users" }, { token, fetchImpl })).resolves.toMatchObject({ outcome: 'failed' });
    await expect(ensureAnswerPadInMeeting({ ...INPUT, origin: 'http://localhost:3022' }, { token, fetchImpl })).resolves.toMatchObject({ outcome: 'failed' });
    await expect(ensureAnswerPadInMeeting({ ...INPUT, origin: 'not a url' }, { token, fetchImpl })).resolves.toMatchObject({ outcome: 'failed' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
