// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MEETING_END, PARTICIPANT_JOIN } from '@/lib/pad/bot/activity';
import { BotAuthError } from '@/lib/pad/bot/verify-activity';
import { POST } from './route';

/**
 * The bot endpoint with the token check and the database replaced: it must
 * refuse before touching anything, write only what a verified activity says,
 * and ask for a retry (500) when a write fails.
 */

const mocks = vi.hoisted(() => ({ verify: vi.fn(), rpc: vi.fn() }));

vi.mock('@/lib/pad/bot/verify-activity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/bot/verify-activity')>()),
  verifyBotRequest: mocks.verify,
}));

vi.mock('@/lib/pad/sessions', () => ({ padDb: () => ({ rpc: mocks.rpc }) }));

const MEETING = 'MCMxOTptZWV0aW5nX05qRXhOalV3';

function request(body: unknown, raw?: string): NextRequest {
  return new NextRequest('http://localhost/api/pad/bot/messages', {
    method: 'POST',
    headers: { Authorization: 'Bearer connector-token', 'Content-Type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  });
}

function joinEvent(tenant = 'tenant-1') {
  return {
    type: 'event',
    name: PARTICIPANT_JOIN,
    timestamp: '2026-09-10T14:34:07.478Z',
    channelId: 'msteams',
    serviceUrl: 'https://smba.trafficmanager.net/in/',
    conversation: { id: '19:meeting_x@thread.v2' },
    channelData: { tenant: { id: tenant }, meeting: { id: MEETING } },
    value: { members: [{ user: { id: '29:asha', aadObjectId: 'AAAA-1' } }, { user: { id: '29:bala', aadObjectId: 'bbbb-2' } }] },
  };
}

beforeEach(() => {
  vi.stubEnv('AZ_TENANT_ID', 'tenant-1');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.verify.mockReset().mockResolvedValue({ appId: 'bot', serviceUrl: 'https://smba.trafficmanager.net/in/', channelId: 'msteams' });
  mocks.rpc.mockReset().mockImplementation(async (fn: string) =>
    fn === 'pad_bot_upsert_conversation' ? { data: null, error: null } : { data: { ok: true }, error: null },
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/pad/bot/messages', () => {
  it('refuses with the status the check chose, before touching the database', async () => {
    mocks.verify.mockRejectedValueOnce(new BotAuthError('Channel not endorsed', 403));
    const refused = await POST(request(joinEvent()));
    expect(refused.status).toBe(403);
    expect(await refused.text()).toBe('');

    mocks.verify.mockRejectedValueOnce(new Error('something odd'));
    expect((await POST(request(joinEvent()))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('answers 400 to a body that is not a JSON object, without checking a token', async () => {
    expect((await POST(request(null, '{not json'))).status).toBe(400);
    expect((await POST(request([1, 2]))).status).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it('remembers the conversation and records each participant who joined', async () => {
    const response = await POST(request(joinEvent()));
    expect(response.status).toBe(200);

    expect(mocks.rpc.mock.calls).toEqual([
      [
        'pad_bot_upsert_conversation',
        {
          p_conversation_id: '19:meeting_x@thread.v2',
          p_service_url: 'https://smba.trafficmanager.net/in/',
          p_tenant_id: 'tenant-1',
          p_meeting_id: MEETING,
          p_team_id: null,
          p_channel_id: null,
        },
      ],
      [
        'pad_bot_participant_event',
        { p_meeting_id: MEETING, p_aad_object_id: 'aaaa-1', p_teams_user_id: '29:asha', p_event: 'join', p_at: '2026-09-10T14:34:07.478Z' },
      ],
      [
        'pad_bot_participant_event',
        { p_meeting_id: MEETING, p_aad_object_id: 'bbbb-2', p_teams_user_id: '29:bala', p_event: 'join', p_at: '2026-09-10T14:34:07.478Z' },
      ],
    ]);
  });

  it('closes open presence when the meeting ends', async () => {
    const end = { ...joinEvent(), name: MEETING_END, value: { id: MEETING, endTime: '2026-09-10T16:00:00Z' } };
    expect((await POST(request(end))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith('pad_bot_meeting_end', { p_meeting_id: MEETING, p_at: '2026-09-10T16:00:00.000Z' });
  });

  it('acknowledges a message typed to the bot without recording anything but the conversation', async () => {
    const message = { ...joinEvent(), type: 'message', text: 'hello', name: undefined, value: undefined };
    expect((await POST(request(message))).status).toBe(200);
    expect(mocks.rpc.mock.calls.map(([fn]) => fn)).toEqual(['pad_bot_upsert_conversation']);
  });

  it('drops an activity from another tenant', async () => {
    expect((await POST(request(joinEvent('someone-else')))).status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('asks the connector to retry when a write fails, with no database text in the answer', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '42P01', message: 'relation "pad_bot_conversations" does not exist' } });
    const failed = await POST(request(joinEvent()));
    expect(failed.status).toBe(500);
    expect(await failed.text()).toBe('');
  });
});
