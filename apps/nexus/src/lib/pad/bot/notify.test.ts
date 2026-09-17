// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NOTIFY_BATCH_SIZE,
  badgeNotificationBody,
  notificationBatches,
  notificationUrl,
  sendBadgeNotifications,
  sendTargetedNotifications,
  targetedNotificationBody,
} from './notify';

const TARGET = { serviceUrl: 'https://smba.trafficmanager.net/in/', meetingId: 'MCMxOTptZWV0aW5n/abc+def==' };
const CONTENT = { title: 'Question 3 is open', url: 'https://nexus.neramclasses.com/pad/teams' };

const ids = (count: number, from = 0) => Array.from({ length: count }, (_, i) => `29:student-${from + i}`);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('notificationBatches', () => {
  it('keeps 29: ids only, each once, 50 to a call', () => {
    expect(notificationBatches(['29:a', '29:a', '8:orgid:b', '', null, 42, '29:c'])).toEqual([['29:a', '29:c']]);
    expect(notificationBatches(ids(120)).map((batch) => batch.length)).toEqual([50, 50, 20]);
    expect(notificationBatches([])).toEqual([]);
    expect(NOTIFY_BATCH_SIZE).toBe(50);
  });
});

describe('the request', () => {
  it('goes to the meeting notification path under the service URL, with the meeting id encoded', () => {
    expect(notificationUrl(TARGET)).toBe('https://smba.trafficmanager.net/in/v1/meetings/MCMxOTptZWV0aW5n%2Fabc%2Bdef%3D%3D/notification');
    expect(notificationUrl({ ...TARGET, serviceUrl: 'https://smba.trafficmanager.net/in' })).toBe(notificationUrl(TARGET));
  });

  it('matches the documented targeted notification body', () => {
    expect(targetedNotificationBody(['29:a'], CONTENT)).toEqual({
      type: 'targetedMeetingNotification',
      value: {
        recipients: ['29:a'],
        surfaces: [
          {
            surface: 'meetingStage',
            contentType: 'task',
            content: { value: { height: '420', width: '360', title: 'Question 3 is open', url: 'https://nexus.neramclasses.com/pad/teams' } },
          },
        ],
      },
    });
  });
});

describe('sendTargetedNotifications', () => {
  const token = async () => 'connector-token';
  const sleep = vi.fn(async () => undefined);

  beforeEach(() => sleep.mockClear());

  it('sends every batch with the connector token and counts what Teams accepted', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
    const result = await sendTargetedNotifications(TARGET, ids(60), CONTENT, { token, fetchImpl, sleep });

    expect(result).toEqual({ recipients: 60, sent: 60, partial: 0, failed: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(notificationUrl(TARGET));
    expect(init.headers).toMatchObject({ Authorization: 'Bearer connector-token', 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body)).value.recipients).toHaveLength(50);
  });

  it('counts a 207 as reaching only some students', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 207 }));
    expect(await sendTargetedNotifications(TARGET, ids(3), CONTENT, { token, fetchImpl, sleep })).toMatchObject({ sent: 0, partial: 3 });
  });

  it('waits out one 429 as Retry-After asks, capped at five seconds, then gives up on a second', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '2' } }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '120' } }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }));

    const result = await sendTargetedNotifications(TARGET, ids(51), CONTENT, { token, fetchImpl, sleep });
    expect(result).toEqual({ recipients: 51, sent: 50, partial: 0, failed: 1 });
    expect(sleep.mock.calls).toEqual([[2000], [5000]]);
  });

  it('keeps going after a refused batch or a dropped connection, and never throws', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"Forbidden"}', { status: 403 }))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    const result = await sendTargetedNotifications(TARGET, ids(120), CONTENT, { token, fetchImpl, sleep });
    expect(result).toEqual({ recipients: 120, sent: 20, partial: 0, failed: 100 });
  });

  it('sends nothing without a token, without recipients, or to a service URL that is not https', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
    const noToken = async () => {
      throw new Error('Bot credentials are not configured');
    };

    expect(await sendTargetedNotifications(TARGET, ids(5), CONTENT, { token: noToken, fetchImpl, sleep })).toMatchObject({ failed: 5 });
    expect(await sendTargetedNotifications(TARGET, ['8:orgid:x'], CONTENT, { token, fetchImpl, sleep })).toEqual({
      recipients: 0,
      sent: 0,
      partial: 0,
      failed: 0,
    });
    expect(
      await sendTargetedNotifications({ ...TARGET, serviceUrl: 'http://attacker.example/' }, ids(2), CONTENT, { token, fetchImpl, sleep }),
    ).toMatchObject({ failed: 2 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('the red badge on the Answer Pad button', () => {
  it('matches the documented app icon badge body', () => {
    expect(badgeNotificationBody(['29:a'], 'answer-pad')).toEqual({
      type: 'targetedMeetingNotification',
      value: { recipients: ['29:a'], surfaces: [{ surface: 'meetingTabIcon', tabEntityId: 'answer-pad' }] },
    });
  });

  it('goes to every batch in its own calls, counted like the pop-up', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
    const sleep = vi.fn(async () => undefined);
    const result = await sendBadgeNotifications(TARGET, ids(55), 'answer-pad', { token: async () => 'connector-token', fetchImpl, sleep });

    expect(result).toEqual({ recipients: 55, sent: 55, partial: 0, failed: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe(notificationUrl(TARGET));
    expect(JSON.parse(String(init.body)).value.surfaces).toEqual([{ surface: 'meetingTabIcon', tabEntityId: 'answer-pad' }]);
  });
});
