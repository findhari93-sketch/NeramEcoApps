// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  istDate,
  meetingRefFromJoinUrl,
  meetingRefFromTeamsContext,
  pickScheduledClass,
  type ScheduledClassCandidate,
} from './meeting-binding';

const MEETING_THREAD = '19:meeting_NGQ5ZmUxYjAtY2E4Zi00ZDA2@thread.v2';
const CHANNEL_THREAD = '19:4f1c2e9b8a7d4c3e9f0a1b2c3d4e5f60@thread.tacv2';
const CHANNEL_POST = '1693999999999';

/** A join URL as Teams writes it; Graph and Outlook differ only in the hex case. */
function joinUrl(thread: string, message = '0', upperHex = false): string {
  let encoded = encodeURIComponent(thread);
  if (!upperHex) encoded = encoded.replace(/%[0-9A-F]{2}/g, (hex) => hex.toLowerCase());
  return `https://teams.microsoft.com/l/meetup-join/${encoded}/${message}?context=%7b%22Tid%22%3a%22t%22%2c%22Oid%22%3a%22o%22%7d`;
}

/** An IST wall-clock time as a real instant. */
function ist(dateTime: string): Date {
  return new Date(`${dateTime}+05:30`);
}

function cls(overrides: Partial<ScheduledClassCandidate> = {}): ScheduledClassCandidate {
  return {
    id: 'class-a',
    classroom_id: 'room-1',
    batch_id: null,
    teacher_id: 'teacher-1',
    scheduled_date: '2026-09-10',
    start_time: '10:00:00',
    end_time: '11:30:00',
    teams_meeting_join_url: joinUrl(MEETING_THREAD),
    teams_meeting_url: null,
    ...overrides,
  };
}

describe('meetingRefFromJoinUrl', () => {
  it('reads the thread of a standalone meeting, which has no channel post', () => {
    expect(meetingRefFromJoinUrl(joinUrl(MEETING_THREAD))).toEqual({ threadId: MEETING_THREAD, messageId: null });
  });

  it('reads the thread and channel post of a channel meeting, whatever the hex case', () => {
    expect(meetingRefFromJoinUrl(joinUrl(CHANNEL_THREAD, CHANNEL_POST, true))).toEqual({
      threadId: CHANNEL_THREAD,
      messageId: CHANNEL_POST,
    });
  });

  it('reads an unencoded path too', () => {
    expect(meetingRefFromJoinUrl(`https://teams.microsoft.com/l/meetup-join/${MEETING_THREAD}/0`)).toEqual({
      threadId: MEETING_THREAD,
      messageId: null,
    });
  });

  it.each([
    null,
    undefined,
    '',
    'not a url',
    'https://teams.microsoft.com/l/channel/19%3aabc%40thread.tacv2/General',
    'https://teams.microsoft.com/l/meetup-join/',
    'https://teams.microsoft.com/l/meetup-join/%E0%A4%A/0',
    'https://teams.microsoft.com/l/meetup-join/not-a-thread/0',
  ])('finds nothing in %j', (url) => {
    expect(meetingRefFromJoinUrl(url)).toBeNull();
  });
});

describe('meetingRefFromTeamsContext', () => {
  it('reads the meeting chat thread', () => {
    expect(meetingRefFromTeamsContext({ chatId: MEETING_THREAD })).toEqual({ threadId: MEETING_THREAD, messageId: null });
  });

  it('reads the channel post from a channel meeting chat id', () => {
    expect(meetingRefFromTeamsContext({ chatId: `${CHANNEL_THREAD};messageid=${CHANNEL_POST}` })).toEqual({
      threadId: CHANNEL_THREAD,
      messageId: CHANNEL_POST,
    });
  });

  it('decodes the thread out of a base64 meeting id when there is no chat id', () => {
    const meetingId = Buffer.from(`0#${MEETING_THREAD}#0`).toString('base64');
    expect(meetingRefFromTeamsContext({ meetingId })).toEqual({ threadId: MEETING_THREAD, messageId: null });
  });

  it('falls back to the channel id', () => {
    expect(meetingRefFromTeamsContext({ channelId: CHANNEL_THREAD })).toEqual({ threadId: CHANNEL_THREAD, messageId: null });
  });

  it('finds nothing when no source holds a thread', () => {
    expect(meetingRefFromTeamsContext({})).toBeNull();
    expect(meetingRefFromTeamsContext({ meetingId: 'bm90IGEgdGhyZWFk', chatId: 'personal', channelId: null })).toBeNull();
  });
});

describe('istDate', () => {
  it('turns the date over at IST midnight, not UTC midnight', () => {
    expect(istDate(new Date('2026-09-10T18:29:59Z'))).toBe('2026-09-10');
    expect(istDate(new Date('2026-09-10T18:30:00Z'))).toBe('2026-09-11');
    expect(istDate(new Date('2026-09-09T20:00:00Z'))).toBe('2026-09-10');
  });
});

describe('pickScheduledClass', () => {
  const ref = { threadId: MEETING_THREAD, messageId: null };

  it('picks the class on the same thread today', () => {
    expect(pickScheduledClass([cls()], ref, ist('2026-09-10T10:15:00'))?.id).toBe('class-a');
  });

  it('matches the thread whatever its case', () => {
    expect(pickScheduledClass([cls()], { threadId: MEETING_THREAD.toLowerCase(), messageId: null }, ist('2026-09-10T10:15:00'))?.id).toBe(
      'class-a',
    );
  });

  it('ignores a class on another thread or another day', () => {
    const otherThread = cls({ teams_meeting_join_url: joinUrl('19:meeting_other@thread.v2') });
    const lastWeek = cls({ scheduled_date: '2026-09-03' });
    expect(pickScheduledClass([otherThread, lastWeek], ref, ist('2026-09-10T10:15:00'))).toBeNull();
  });

  it('reads teams_meeting_url when there is no join URL', () => {
    const legacy = cls({ teams_meeting_join_url: null, teams_meeting_url: joinUrl(MEETING_THREAD) });
    expect(pickScheduledClass([legacy], ref, ist('2026-09-10T10:15:00'))?.id).toBe('class-a');
  });

  it('tells channel meetings in one channel apart by their post, when both sides know it', () => {
    const monday = cls({ id: 'post-1', teams_meeting_join_url: joinUrl(CHANNEL_THREAD, '111') });
    const extra = cls({ id: 'post-2', teams_meeting_join_url: joinUrl(CHANNEL_THREAD, '222') });
    const now = ist('2026-09-10T10:15:00');

    expect(pickScheduledClass([monday, extra], { threadId: CHANNEL_THREAD, messageId: '222' }, now)?.id).toBe('post-2');
    expect(pickScheduledClass([monday], { threadId: CHANNEL_THREAD, messageId: '222' }, now)).toBeNull();
    expect(pickScheduledClass([monday], { threadId: CHANNEL_THREAD, messageId: null }, now)?.id).toBe('post-1');
  });

  it("prefers today's instance of a recurring meeting over yesterday's", () => {
    const yesterday = cls({ id: 'yesterday', scheduled_date: '2026-09-09' });
    const today = cls({ id: 'today' });
    expect(pickScheduledClass([yesterday, today], ref, ist('2026-09-10T09:50:00'))?.id).toBe('today');
  });

  it('picks the class running now, then the nearest one, when a thread has two classes in a day', () => {
    const morning = cls({ id: 'morning', start_time: '10:00', end_time: '11:30' });
    const evening = cls({ id: 'evening', start_time: '16:00', end_time: '17:30' });

    expect(pickScheduledClass([morning, evening], ref, ist('2026-09-10T16:10:00'))?.id).toBe('evening');
    expect(pickScheduledClass([morning, evening], ref, ist('2026-09-10T15:40:00'))?.id).toBe('evening');
    expect(pickScheduledClass([morning, evening], ref, ist('2026-09-10T12:45:00'))?.id).toBe('morning');
    expect(pickScheduledClass([evening, morning], ref, ist('2026-09-10T13:00:00'))?.id).toBe('morning');
  });

  it("keeps last night's class that ran past midnight, and drops one that ended hours ago", () => {
    const lateNight = cls({ id: 'late', scheduled_date: '2026-09-10', start_time: '23:00', end_time: '00:30' });
    const afternoon = cls({ id: 'afternoon', scheduled_date: '2026-09-10', start_time: '14:00', end_time: '15:00' });
    const justAfterMidnight = ist('2026-09-11T00:10:00');

    expect(pickScheduledClass([lateNight], ref, justAfterMidnight)?.id).toBe('late');
    expect(pickScheduledClass([afternoon], ref, justAfterMidnight)).toBeNull();
  });

  it('breaks an exact tie by id, so the answer never flickers between requests', () => {
    const b = cls({ id: 'class-b' });
    const a = cls({ id: 'class-a' });
    expect(pickScheduledClass([b, a], ref, ist('2026-09-10T10:15:00'))?.id).toBe('class-a');
    expect(pickScheduledClass([a, b], ref, ist('2026-09-10T10:15:00'))?.id).toBe('class-a');
  });
});
