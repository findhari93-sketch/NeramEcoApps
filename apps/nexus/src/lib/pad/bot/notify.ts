/**
 * "Question 3 is open": the in-meeting notification that takes students who do
 * not have the pad open straight to it, and the red badge on the Answer Pad
 * button that goes with it.
 *
 * Both are targeted meeting notifications (Teams "Meeting apps APIs"): POST
 * {serviceUrl}v1/meetings/{meetingId}/notification, type
 * targetedMeetingNotification, the students' 29: ids, and a surface. The pop-up
 * uses the meetingStage surface, a small dialog showing the pad's answer page;
 * the badge uses meetingTabIcon, a red dot on the app's button in the meeting's
 * top bar, which only Teams desktop shows and never in a channel meeting. The
 * app needs the OnlineMeetingNotification.Send.Chat permission (resource-specific
 * consent), and the pad's address must be in the manifest's validDomains. Teams
 * answers 202 when everyone got it and 207 when only some did.
 *
 * The two go in separate calls, so a badge Teams refuses can never cost a
 * student the pop-up. Recipients go 50 to a call. A 429 waits as long as
 * Retry-After asks (a few seconds at most) and tries once more. Nothing here
 * throws: a notification that fails must never fail the ASK that sent it, so
 * failures are counted and logged instead.
 */

import { connectorToken } from './connector-token';

export const NOTIFY_BATCH_SIZE = 50;
const MAX_RETRY_WAIT_MS = 5_000;
const DEFAULT_RETRY_WAIT_MS = 1_000;

export interface NotificationTarget {
  serviceUrl: string;
  meetingId: string;
}

export interface NotificationContent {
  title: string;
  /** Must be on a domain listed in the manifest's validDomains. */
  url: string;
}

export interface NotifyResult {
  recipients: number;
  /** Recipients in calls Teams accepted for everyone (202). */
  sent: number;
  /** Recipients in calls Teams accepted for only some of them (207). */
  partial: number;
  failed: number;
}

export interface NotifyDeps {
  token?: () => Promise<string>;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/** Only 29: ids can receive a targeted notification; each person once, 50 to a call. */
export function notificationBatches(recipients: readonly unknown[]): string[][] {
  const unique = [...new Set(recipients.filter((id): id is string => typeof id === 'string' && id.startsWith('29:')))];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += NOTIFY_BATCH_SIZE) batches.push(unique.slice(i, i + NOTIFY_BATCH_SIZE));
  return batches;
}

export function notificationUrl(target: NotificationTarget): string {
  const base = target.serviceUrl.endsWith('/') ? target.serviceUrl : `${target.serviceUrl}/`;
  return `${base}v1/meetings/${encodeURIComponent(target.meetingId)}/notification`;
}

export function targetedNotificationBody(recipients: string[], content: NotificationContent) {
  return {
    type: 'targetedMeetingNotification',
    value: {
      recipients,
      surfaces: [
        {
          surface: 'meetingStage',
          contentType: 'task',
          content: { value: { height: '420', width: '360', title: content.title, url: content.url } },
        },
      ],
    },
  };
}

/** The red dot on the app's button. `tabEntityId` picks the Answer Pad tab if a meeting has more than one app. */
export function badgeNotificationBody(recipients: string[], tabEntityId: string) {
  return {
    type: 'targetedMeetingNotification',
    value: {
      recipients,
      surfaces: [{ surface: 'meetingTabIcon', tabEntityId }],
    },
  };
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function postBatch(
  fetchImpl: typeof fetch,
  sleep: (ms: number) => Promise<void>,
  url: string,
  token: string,
  body: unknown,
): Promise<number> {
  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      return 0;
    }
    if (response.status !== 429 || attempt >= 1) return response.status;

    const seconds = Number(response.headers.get('Retry-After'));
    await sleep(Math.min(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_WAIT_MS, MAX_RETRY_WAIT_MS));
  }
}

async function sendInBatches(
  target: NotificationTarget,
  recipients: readonly unknown[],
  bodyFor: (batch: string[]) => unknown,
  what: string,
  deps: NotifyDeps,
): Promise<NotifyResult> {
  const batches = notificationBatches(recipients);
  const result: NotifyResult = { recipients: batches.reduce((sum, batch) => sum + batch.length, 0), sent: 0, partial: 0, failed: 0 };
  if (result.recipients === 0) return result;

  // The service URL comes from a verified connector activity; anything else is not sent a token.
  if (!/^https:\/\//i.test(target.serviceUrl) || !target.meetingId) {
    result.failed = result.recipients;
    return result;
  }

  let token: string;
  try {
    token = await (deps.token ?? (() => connectorToken()))();
  } catch (err) {
    console.error(`[pad notify] no connector token: ${err instanceof Error ? err.message : 'unknown error'}`);
    result.failed = result.recipients;
    return result;
  }

  const url = notificationUrl(target);
  for (const batch of batches) {
    const status = await postBatch(deps.fetchImpl ?? fetch, deps.sleep ?? wait, url, token, bodyFor(batch));
    if (status === 207) result.partial += batch.length;
    else if (status >= 200 && status < 300) result.sent += batch.length;
    else {
      result.failed += batch.length;
      console.error(`[pad notify] a ${what} to ${batch.length} students was refused: ${status || 'no response'}`);
    }
  }
  return result;
}

export async function sendTargetedNotifications(
  target: NotificationTarget,
  recipients: readonly unknown[],
  content: NotificationContent,
  deps: NotifyDeps = {},
): Promise<NotifyResult> {
  return sendInBatches(target, recipients, (batch) => targetedNotificationBody(batch, content), 'notification', deps);
}

export async function sendBadgeNotifications(
  target: NotificationTarget,
  recipients: readonly unknown[],
  tabEntityId: string,
  deps: NotifyDeps = {},
): Promise<NotifyResult> {
  return sendInBatches(target, recipients, (batch) => badgeNotificationBody(batch, tabEntityId), 'badge', deps);
}
