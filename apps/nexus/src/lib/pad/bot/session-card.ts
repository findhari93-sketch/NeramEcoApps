/**
 * The one message the Answer Pad posts in a class's meeting chat when a session
 * starts: the pad is on, here is the room code, and two ways in.
 *
 * It exists for everyone the pop-up and the side panel miss. Teams on the web
 * cannot show meeting side panels, and a student who closed the question pop-up
 * on a phone would otherwise have to find the pad under More. A chat card
 * renders on every Teams client:
 *   - "Open Answer Pad" is Teams' deep link to the meeting side panel, which
 *     opens the panel directly on phones;
 *   - "Answer in browser" is the room-code page, signed in with Nexus as usual.
 *
 * Posted once per session, never per question, so the chat stays about the class.
 */

import { connectorToken } from './connector-token';

export interface PanelLinkInput {
  /** The Teams app's manifest id (the dev app has its own). */
  teamsAppId: string;
  entityId: string;
  /** The meeting chat thread, without a channel meeting's ;messageid= part. */
  chatId: string;
  websiteUrl: string;
  label: string;
}

/** Teams' deep link to a meeting side panel ("Deep links for workflows"), every part encoded. */
export function answerPadPanelLink(input: PanelLinkInput): string {
  const context = JSON.stringify({ chatId: input.chatId, contextType: 'chat' });
  return (
    `https://teams.microsoft.com/l/entity/${encodeURIComponent(input.teamsAppId)}/${encodeURIComponent(input.entityId)}` +
    `?webUrl=${encodeURIComponent(input.websiteUrl)}&label=${encodeURIComponent(input.label)}&context=${encodeURIComponent(context)}`
  );
}

export interface SessionCardInput {
  roomCode: string;
  /** The room-code page for this session. */
  browserUrl: string;
  /** The side panel deep link, or null when the Teams app id is not configured. */
  panelLink: string | null;
}

/** Six digits read more easily aloud and across a room as two groups of three. */
function spacedCode(code: string): string {
  return /^\d{6}$/.test(code) ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

export function sessionCardActivity(input: SessionCardInput) {
  const actions: Array<{ type: 'Action.OpenUrl'; title: string; url: string; style?: 'positive' }> = [];
  if (input.panelLink) actions.push({ type: 'Action.OpenUrl', title: 'Open Answer Pad', url: input.panelLink, style: 'positive' });
  actions.push({ type: 'Action.OpenUrl', title: 'Answer in browser', url: input.browserUrl });

  return {
    type: 'message',
    summary: 'Answer Pad is on for this class',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          type: 'AdaptiveCard',
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          version: '1.4',
          body: [
            { type: 'TextBlock', text: 'Answer Pad is on for this class', weight: 'Bolder', size: 'Medium', wrap: true },
            { type: 'TextBlock', text: 'Questions pop up on your screen. Closed one? Open the pad here.', wrap: true, spacing: 'Small' },
            { type: 'TextBlock', text: 'Room code', isSubtle: true, size: 'Small', spacing: 'Medium' },
            { type: 'TextBlock', text: spacedCode(input.roomCode), weight: 'Bolder', size: 'ExtraLarge', spacing: 'None' },
          ],
          actions,
        },
      },
    ],
  };
}

export interface ConversationTarget {
  serviceUrl: string;
  conversationId: string;
}

/** Post an activity into a conversation the bot is in. Returns Teams' status, or 0 when nothing was sent. Never throws. */
export async function postToConversation(
  target: ConversationTarget,
  activity: unknown,
  deps: { token?: () => Promise<string>; fetchImpl?: typeof fetch } = {},
): Promise<number> {
  // The service URL comes from a verified connector activity; anything else is not sent a token.
  if (!/^https:\/\//i.test(target.serviceUrl) || !target.conversationId) return 0;

  let token: string;
  try {
    token = await (deps.token ?? (() => connectorToken()))();
  } catch (err) {
    console.error(`[pad notify] no connector token: ${err instanceof Error ? err.message : 'unknown error'}`);
    return 0;
  }

  const base = target.serviceUrl.endsWith('/') ? target.serviceUrl : `${target.serviceUrl}/`;
  try {
    const response = await (deps.fetchImpl ?? fetch)(`${base}v3/conversations/${encodeURIComponent(target.conversationId)}/activities`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(activity),
    });
    return response.status;
  } catch {
    return 0;
  }
}
