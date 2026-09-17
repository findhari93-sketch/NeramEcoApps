/**
 * Put the Answer Pad in a class meeting before anybody has to add it.
 *
 * Teams has no setting that adds an app to every meeting, so Nexus does it per
 * class through Graph: install the app into the meeting's chat, then pin its
 * tab (POST /chats/{id}/installedApps, POST /chats/{id}/tabs). When the chat
 * belongs to an online meeting both land in the meeting itself, and the Answer
 * Pad button appears in the meeting's top bar for everyone in it.
 *
 * Three things shape this file:
 *
 *   1. Least privilege. The Nexus Entra app holds only the "Self" permissions,
 *      TeamsAppInstallation.ReadWriteAndConsentSelfForChat.All and
 *      TeamsTab.ReadWriteSelfForChat.All, so it can install and pin itself and
 *      nothing else. The plain ReadWrite permissions cannot install an app that
 *      carries resource-specific permissions, and ours does, which is why the
 *      install sends a consent set, and that set must equal the manifest's.
 *   2. Timing. A scheduled meeting's chat can refuse Graph until somebody joins,
 *      so a 404 on the first read is "not ready yet", reported as such for the
 *      sweep to retry, not a failure.
 *   3. Channel meetings. A meeting created inside a Teams channel lives on the
 *      channel's thread (@thread.tacv2), which the chats API cannot address.
 *      Those keep the manual Apps step.
 *
 * Nothing here throws. Scheduling a class must never fail because the pad could
 * not be added, and the teacher can always add it from Apps.
 */

import { getAppOnlyToken } from '@/lib/graph-app-token';
import { meetingRefFromJoinUrl } from './meeting-binding';
import { answerPadTab } from './teams-tab';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const TIMEOUT_MS = 10_000;
const MEETING_CHAT = /^19:[A-Za-z0-9_.-]+@thread\.v2$/;
const CATALOG_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The manifest's resource-specific permissions, which the install consents to. teams-manifest checks they match. */
export const PAD_RSC_PERMISSIONS = [
  { name: 'OnlineMeetingParticipant.Read.Chat', type: 'Application' },
  { name: 'OnlineMeetingNotification.Send.Chat', type: 'Application' },
  { name: 'ChannelMeetingParticipant.Read.Group', type: 'Application' },
  { name: 'ChannelMeetingNotification.Send.Group', type: 'Application' },
  { name: 'MeetingStage.Write.Chat', type: 'Delegated' },
] as const;

export type MeetingTabOutcome =
  | 'added'
  | 'already'
  /** No join link, or a channel meeting: the teacher adds the pad from Apps. */
  | 'not_meeting_chat'
  /** The chat does not answer yet, usually because nobody has joined. Retry later. */
  | 'chat_not_ready'
  /** Graph said 403: the Self permissions or their admin consent are missing. */
  | 'permission_missing'
  | 'failed';

export interface MeetingTabResult {
  outcome: MeetingTabOutcome;
  chatId: string | null;
  /** For the logs: which step, the status and the start of Graph's message. Never a token. */
  reason?: string;
}

export interface MeetingTabInput {
  joinUrl: string | null | undefined;
  /** The org catalog id of the Teams app (not the manifest id). */
  catalogAppId: string;
  /** Where the tab loads from: https://nexus.neramclasses.com, or the tunnel while testing. */
  origin: string;
}

export interface MeetingTabDeps {
  token?: () => Promise<string>;
  fetchImpl?: typeof fetch;
}

/** The meeting chat a join link belongs to, or null for a channel meeting or a link that is not a meeting. */
export function meetingChatIdFromJoinUrl(joinUrl: string | null | undefined): string | null {
  const ref = meetingRefFromJoinUrl(joinUrl);
  return ref && MEETING_CHAT.test(ref.threadId) ? ref.threadId : null;
}

export function consentedPermissionSet() {
  return {
    resourceSpecificPermissions: PAD_RSC_PERMISSIONS.map((permission) => ({
      permissionValue: permission.name,
      permissionType: permission.type,
    })),
  };
}

type Sent = { response: Response } | { error: string };

async function listsApp(response: Response, catalogAppId: string): Promise<boolean> {
  const data = await response.json().catch(() => null);
  if (!Array.isArray(data?.value)) return false;
  return data.value.some(
    (item: { teamsApp?: { id?: string; externalId?: string } }) =>
      item?.teamsApp?.id === catalogAppId || item?.teamsApp?.externalId === catalogAppId,
  );
}

async function refused(chatId: string, step: string, response: Response, notFound: MeetingTabOutcome): Promise<MeetingTabResult> {
  const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 300);
  const outcome: MeetingTabOutcome = response.status === 404 ? notFound : response.status === 403 ? 'permission_missing' : 'failed';
  return { outcome, chatId, reason: `${step}: ${response.status}${detail ? ` ${detail}` : ''}` };
}

export async function ensureAnswerPadInMeeting(input: MeetingTabInput, deps: MeetingTabDeps = {}): Promise<MeetingTabResult> {
  const chatId = meetingChatIdFromJoinUrl(input.joinUrl);
  if (!chatId) return { outcome: 'not_meeting_chat', chatId: null };

  if (!CATALOG_ID.test(input.catalogAppId)) {
    return { outcome: 'failed', chatId, reason: 'the Teams app catalog id is not a GUID' };
  }
  let origin: URL;
  try {
    origin = new URL(input.origin);
  } catch {
    return { outcome: 'failed', chatId, reason: 'the tab origin is not a URL' };
  }
  if (origin.protocol !== 'https:') return { outcome: 'failed', chatId, reason: 'the tab origin must be https' };

  let token: string;
  try {
    token = await (deps.token ?? getAppOnlyToken)();
  } catch (err) {
    return { outcome: 'failed', chatId, reason: `no Graph token: ${err instanceof Error ? err.message : 'unknown error'}` };
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  // The chat id was checked against MEETING_CHAT above, so it is safe in the path as it stands.
  const send = async (method: 'GET' | 'POST', suffix: string, body?: unknown): Promise<Sent> => {
    try {
      const response = await fetchImpl(`${GRAPH}/chats/${chatId}${suffix}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return { response };
    } catch (err) {
      return { error: `${method} ${suffix.split('?')[0]}: ${err instanceof Error ? err.message : 'network error'}` };
    }
  };
  const appBind = `${GRAPH}/appCatalogs/teamsApps/${input.catalogAppId}`;

  const tabs = await send('GET', '/tabs?$expand=teamsApp');
  if ('error' in tabs) return { outcome: 'failed', chatId, reason: tabs.error };
  if (!tabs.response.ok) return refused(chatId, 'list tabs', tabs.response, 'chat_not_ready');
  if (await listsApp(tabs.response, input.catalogAppId)) return { outcome: 'already', chatId };

  const apps = await send('GET', '/installedApps?$expand=teamsApp');
  if ('error' in apps) return { outcome: 'failed', chatId, reason: apps.error };
  if (!apps.response.ok) return refused(chatId, 'list apps', apps.response, 'chat_not_ready');

  if (!(await listsApp(apps.response, input.catalogAppId))) {
    const install = await send('POST', '/installedApps', {
      'teamsApp@odata.bind': appBind,
      consentedPermissionSet: consentedPermissionSet(),
    });
    if ('error' in install) return { outcome: 'failed', chatId, reason: install.error };
    // 409: somebody (or an overlapping sweep) installed it a moment ago, which is fine.
    // A 404 here means the chat answered but the app is not in the catalog.
    if (!install.response.ok && install.response.status !== 409) {
      return refused(chatId, 'install the app', install.response, 'failed');
    }
  }

  const tab = answerPadTab(origin.origin);
  const pin = await send('POST', '/tabs', {
    displayName: tab.displayName,
    'teamsApp@odata.bind': appBind,
    configuration: { entityId: tab.entityId, contentUrl: tab.contentUrl, websiteUrl: tab.websiteUrl },
  });
  if ('error' in pin) return { outcome: 'failed', chatId, reason: pin.error };
  if (!pin.response.ok) return refused(chatId, 'add the tab', pin.response, 'failed');

  return { outcome: 'added', chatId };
}
