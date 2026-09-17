// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MEETING_END, PARTICIPANT_JOIN, PARTICIPANT_LEAVE, botAction, conversationRef } from './activity';

/**
 * Fixtures follow the payloads in Microsoft's "Meeting apps APIs" article,
 * including its quirks: padded ids, and event names with a leading space.
 */

const MEETING = 'MCMxOTptZWV0aW5nX05qRXhOalV3@thread.v2';

function participantEvent(name: string, members: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    type: 'event',
    name,
    timestamp: '2026-09-10T14:34:07.478Z',
    channelId: 'msteams',
    serviceUrl: 'https://smba.trafficmanager.net/in/',
    from: { id: '29:organiser' },
    conversation: { isGroup: true, conversationType: 'groupchat', id: '19:meeting_threadId@thread.v2' },
    recipient: { id: '28:bot' },
    value: { members },
    channelData: { tenant: { id: 'tenant-1' }, meeting: { id: MEETING } },
    ...overrides,
  };
}

const member = (aadObjectId: string | undefined, id = '29:student') => ({
  user: { tenantId: 'tenant-1', objectId: aadObjectId, id, name: 'Test User', aadObjectId },
  meeting: { inMeeting: true, role: 'Attendee' },
});

describe('botAction', () => {
  it('reads a participant join, with the Entra id lowercased and trimmed', () => {
    expect(botAction(participantEvent(PARTICIPANT_JOIN, [member(' 3F2504E0-4F89-11D3-9A0C-0305E82C3301 ')]))).toEqual({
      kind: 'participants',
      meetingId: MEETING,
      event: 'join',
      at: '2026-09-10T14:34:07.478Z',
      members: [{ aadObjectId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301', teamsUserId: '29:student' }],
    });
  });

  it('reads a participant leave, and skips the bot itself, which has no Entra id', () => {
    const action = botAction(participantEvent(PARTICIPANT_LEAVE, [member(undefined, '28:bot'), member('aaaa', '29:a')]));
    expect(action).toMatchObject({ kind: 'participants', event: 'leave', members: [{ aadObjectId: 'aaaa', teamsUserId: '29:a' }] });
    expect(botAction(participantEvent(PARTICIPANT_LEAVE, [member(undefined, '28:bot')]))).toEqual({ kind: 'ignore' });
  });

  it('accepts the event name with the leading space the documentation shows', () => {
    expect(botAction(participantEvent(` ${PARTICIPANT_JOIN}`, [member('aaaa')]))).toMatchObject({ kind: 'participants', event: 'join' });
  });

  it('keeps only 29: ids as notification addresses', () => {
    const action = botAction(participantEvent(PARTICIPANT_JOIN, [member('aaaa', '8:orgid:aaaa')]));
    expect(action).toMatchObject({ members: [{ aadObjectId: 'aaaa', teamsUserId: null }] });
  });

  it('ignores a participant event with no meeting id or no usable members', () => {
    expect(botAction(participantEvent(PARTICIPANT_JOIN, [member('aaaa')], { channelData: { tenant: { id: 't' } } }))).toEqual({ kind: 'ignore' });
    expect(botAction(participantEvent(PARTICIPANT_JOIN, [null, 'x', { user: 'x' }]))).toEqual({ kind: 'ignore' });
    expect(botAction(participantEvent(PARTICIPANT_JOIN, [member('a'.repeat(600))]))).toEqual({ kind: 'ignore' });
  });

  it('caps the members read from one event', () => {
    const many = Array.from({ length: 400 }, (_, i) => member(`id-${i}`, `29:${i}`));
    const action = botAction(participantEvent(PARTICIPANT_JOIN, many));
    expect(action.kind === 'participants' && action.members.length).toBe(300);
  });

  it('reads a meeting end in either casing, preferring the stated end time', () => {
    const base = { type: 'event', name: ` ${MEETING_END}`, timestamp: '2026-09-10T16:00:05Z', channelData: { tenant: { id: 't' } } };
    expect(botAction({ ...base, value: { id: MEETING, endTime: '2026-09-10T16:00:00Z' } })).toEqual({
      kind: 'meeting-end',
      meetingId: MEETING,
      at: '2026-09-10T16:00:00.000Z',
    });
    expect(botAction({ ...base, value: { Id: MEETING, EndTime: '2026-09-10T15:59:00Z' } })).toMatchObject({ at: '2026-09-10T15:59:00.000Z' });
    expect(botAction({ ...base, value: { id: MEETING } })).toMatchObject({ at: '2026-09-10T16:00:05.000Z' });
    expect(botAction({ ...base, value: {} })).toEqual({ kind: 'ignore' });
  });

  it('ignores messages, installs, meeting start and anything unknown', () => {
    expect(botAction({ type: 'message', text: 'hello' })).toEqual({ kind: 'ignore' });
    expect(botAction({ type: 'conversationUpdate', membersAdded: [{ id: '28:bot' }] })).toEqual({ kind: 'ignore' });
    expect(botAction({ type: 'event', name: 'application/vnd.microsoft.meetingStart', value: { id: MEETING } })).toEqual({ kind: 'ignore' });
    expect(botAction({})).toEqual({ kind: 'ignore' });
  });
});

describe('conversationRef', () => {
  it('remembers a meeting chat with its meeting id', () => {
    expect(conversationRef(participantEvent(PARTICIPANT_JOIN, []))).toEqual({
      conversationId: '19:meeting_threadId@thread.v2',
      serviceUrl: 'https://smba.trafficmanager.net/in/',
      tenantId: 'tenant-1',
      meetingId: MEETING,
      teamId: null,
      channelId: null,
    });
  });

  it('remembers a channel meeting with its team and channel', () => {
    const ref = conversationRef({
      type: 'conversationUpdate',
      serviceUrl: 'https://smba.trafficmanager.net/in/',
      conversation: { id: '19:channel@thread.tacv2;messageid=1', tenantId: 'tenant-2' },
      channelData: { team: { id: '19:team@thread.tacv2' }, channel: { id: '19:channel@thread.tacv2' } },
    });
    expect(ref).toMatchObject({ tenantId: 'tenant-2', meetingId: null, teamId: '19:team@thread.tacv2', channelId: '19:channel@thread.tacv2' });
  });

  it('refuses a conversation without an https service URL or an id', () => {
    expect(conversationRef({ serviceUrl: 'http://smba.trafficmanager.net/in/', conversation: { id: 'c' } })).toBeNull();
    expect(conversationRef({ serviceUrl: 'https://smba.trafficmanager.net/in/', conversation: {} })).toBeNull();
    expect(conversationRef({})).toBeNull();
  });
});
