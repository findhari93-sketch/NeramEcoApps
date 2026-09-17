/**
 * What the Answer Pad says in a class meeting, beyond its own panel:
 *
 *   - "Question N is open" for one session: who should get it, which bot
 *     conversation reaches the meeting, and sending the pop-up with its badge.
 *   - The one chat card a session posts when it starts, with the room code and
 *     the two ways in that work on every Teams client.
 *
 * The database decides who gets a question notice (pad_notification_targets):
 * students on the class list who do not have the pad open, and, once the bot
 * has seen the meeting's participants, only those actually in it. A session
 * with no Teams meeting, a meeting without the bot, or a class already on the
 * pad sends nothing.
 */

import { sendBadgeNotifications, sendTargetedNotifications, type NotifyResult } from './bot/notify';
import { answerPadPanelLink, postToConversation, sessionCardActivity } from './bot/session-card';
import { callPad } from './rpc';
import { loadSessionMeta, meetingConversation, padDb, rosterIds, sessionRoomCode } from './sessions';
import { ANSWER_PAD_ENTITY_ID, answerPadTab, answerPopupUrl } from './teams-tab';

/** Sent with ASK. Capped so a slow Teams never holds up the teacher's button. */
const ASK_NOTICE_BUDGET_MS = 2_500;
/** Posted when a session starts. Capped the same way, so the console opens promptly. */
const ANNOUNCE_BUDGET_MS = 2_500;

const NOTHING_SENT: NotifyResult = { recipients: 0, sent: 0, partial: 0, failed: 0 };

type Env = Record<string, string | undefined>;

/**
 * The https address Teams was given for the pad. Behind a tunnel the request
 * reaches the local server, whose own origin is not that address, so
 * PAD_TEAMS_TAB_ORIGIN names it. In production the request origin is already right.
 */
export function padPublicOrigin(requestOrigin: string, env: Env = process.env): string {
  return (env.PAD_TEAMS_TAB_ORIGIN?.trim() || requestOrigin).replace(/\/+$/, '');
}

/** The question pop-up's address. */
export function questionPopupUrl(requestOrigin: string, env: Env = process.env): string {
  return answerPopupUrl(padPublicOrigin(requestOrigin, env));
}

export interface QuestionNotice {
  /** Why nothing was sent, when nothing was. */
  skipped: 'no-meeting' | 'no-bot' | 'nobody-to-remind' | null;
  /** Students on the class list without the pad open. */
  notConnected: number;
  delivery: NotifyResult;
}

export async function notifyQuestionOpen(sessionId: string, content: { title: string; padUrl: string }): Promise<QuestionNotice> {
  const meta = await loadSessionMeta(sessionId);
  if (!meta?.meeting_id) return { skipped: 'no-meeting', notConnected: 0, delivery: NOTHING_SENT };

  const conversation = await meetingConversation(meta.meeting_id);
  if (!conversation) return { skipped: 'no-bot', notConnected: 0, delivery: NOTHING_SENT };

  const targets = await callPad<{ ok: true; recipients: unknown[]; not_connected: number }>(padDb(), 'pad_notification_targets', {
    p_actor: meta.teacher_id,
    p_session: sessionId,
    p_roster: await rosterIds(meta.classroom_id, meta.batch_id),
  });
  const recipients = Array.isArray(targets.recipients) ? targets.recipients : [];
  if (recipients.length === 0) return { skipped: 'nobody-to-remind', notConnected: targets.not_connected ?? 0, delivery: NOTHING_SENT };

  const target = { serviceUrl: conversation.service_url, meetingId: meta.meeting_id };
  const [delivery] = await Promise.all([
    sendTargetedNotifications(target, recipients, { title: content.title, url: content.padUrl }),
    // The red dot on the Answer Pad button. Only Teams desktop shows it, and never
    // in a channel meeting, which is why the pop-up above is the main signal.
    sendBadgeNotifications(target, recipients, ANSWER_PAD_ENTITY_ID),
  ]);
  return { skipped: null, notConnected: targets.not_connected ?? 0, delivery };
}

async function withinBudget(work: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  await Promise.race([work, budget]);
  clearTimeout(timer);
}

/** The notice that goes out with ASK. Never throws, and never waits longer than its budget. */
export async function noticeForAsk(sessionId: string, sequence: number, origin: string): Promise<void> {
  const work = notifyQuestionOpen(sessionId, { title: `Question ${sequence} is open`, padUrl: questionPopupUrl(origin) }).then(
    () => undefined,
    (err: unknown) => {
      console.error(`[pad notify] question ${sequence}: ${err instanceof Error ? err.message : 'could not send'}`);
    },
  );
  await withinBudget(work, ASK_NOTICE_BUDGET_MS);
}

export type SessionAnnouncement = 'posted' | 'no-meeting' | 'no-bot' | 'failed';

/** Post the session's card in the meeting chat. */
export async function announceSessionInChat(sessionId: string, requestOrigin: string, env: Env = process.env): Promise<SessionAnnouncement> {
  const meta = await loadSessionMeta(sessionId);
  if (!meta?.meeting_id) return 'no-meeting';

  const conversation = await meetingConversation(meta.meeting_id);
  if (!conversation?.conversation_id) return 'no-bot';

  const roomCode = await sessionRoomCode(sessionId);
  if (!roomCode) return 'failed';

  const origin = padPublicOrigin(requestOrigin, env);
  const tab = answerPadTab(origin);
  const teamsAppId = env.PAD_TEAMS_APP_ID?.trim();
  // A meeting chat's conversation id is its thread; a channel meeting's also names the channel post.
  const chatId = conversation.conversation_id.split(';')[0];
  const panelLink = teamsAppId
    ? answerPadPanelLink({ teamsAppId, entityId: tab.entityId, chatId, websiteUrl: tab.websiteUrl, label: tab.displayName })
    : null;

  const status = await postToConversation(
    { serviceUrl: conversation.service_url, conversationId: conversation.conversation_id },
    sessionCardActivity({ roomCode, browserUrl: `${origin}/pad/r/${roomCode}`, panelLink }),
  );
  if (status >= 200 && status < 300) return 'posted';
  console.error(`[pad notify] the class chat card was refused: ${status || 'no response'}`);
  return 'failed';
}

/** The card that goes out when a session starts. Never throws, and never waits longer than its budget. */
export async function announceForStart(sessionId: string, origin: string): Promise<void> {
  const work = announceSessionInChat(sessionId, origin).then(
    () => undefined,
    (err: unknown) => {
      console.error(`[pad notify] class chat card: ${err instanceof Error ? err.message : 'could not send'}`);
    },
  );
  await withinBudget(work, ANNOUNCE_BUDGET_MS);
}
