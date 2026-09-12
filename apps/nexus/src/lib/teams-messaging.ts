/**
 * Best-effort Microsoft Teams 1:1 chat message from the signed-in teacher
 * (delegated token). Creating the chat needs Chat.ReadWrite (or Chat.Create) and
 * posting needs ChatMessage.Send, both in loginScopes.nexusTeacher, so the
 * caller's browser must send getTeacherToken(), never getToken(). Never throws.
 *
 * HISTORY, because this file was deprecated once and the reason still holds for
 * everything except its current caller:
 *
 * This used to back the assignment reminder feature, and was retired in favour
 * of the app-only Activity-feed path (`sendTeamsActivityNotification` in
 * @neram/auth) because TEMPLATED, AUTOMATED reminders posted into a real 1:1
 * chat are clutter: a sweep that fires every weekday morning turns a genuine
 * conversation with a teacher into a notification log.
 *
 * That reasoning does not extend to a message a teacher wrote, to students they
 * picked, about a specific test in front of them. There the chat IS the point,
 * because the student can reply to it, and a reply is the "tell me why you did
 * not sit it" half of the reopen flow.
 *
 * So the rule is about the SENDER, not the channel:
 *   - A person composing a message to a named group: this is correct.
 *   - A cron, a sweep, or any templated automated reminder: use the Activity
 *     feed. Do not re-wire this for those.
 *
 * WHY IT RETURNS A REASON. On 11 Sept a reopen message reached 0 of 23 students'
 * Teams chats, and the only trace was a console line in Vercel logs that cannot
 * be read after the fact. The reason now travels back to the teacher's receipt.
 */

export interface TeamsChatResult {
  ok: boolean;
  /** The HTTP status Graph answered with, or 0 when the call never completed. */
  status: number;
  /** What went wrong, with Graph's own code, for the receipt. */
  reason?: string;
}

const GRAPH = 'https://graph.microsoft.com/v1.0';

/** Graph's error code and message, trimmed to something a receipt can show. */
async function graphReason(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const parsed = JSON.parse(text);
    const code = parsed?.error?.code;
    const message = parsed?.error?.message;
    return `${res.status}${code ? ` ${code}` : ''}${message ? `: ${message}` : ''}`.slice(0, 200);
  } catch {
    return `${res.status}${text ? `: ${text}` : ''}`.slice(0, 200);
  }
}

/** One retry on 429, after the Retry-After Graph asks for, capped at 5 seconds. */
async function postWithRetry(url: string, token: string, payload: unknown): Promise<Response> {
  const send = () =>
    fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  const first = await send();
  if (first.status !== 429) return first;
  const seconds = Math.min(5, Math.max(1, Number(first.headers.get('Retry-After')) || 1));
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  return send();
}

/**
 * Send one chat message.
 *
 * `recipient` is the student's Entra object id when we have one, else their
 * UPN. The id is preferred: a student whose only stored address is on another
 * domain (Kaveya's is @neram.co.in) can never be reached by UPN.
 */
export interface TeamsChatAttachment {
  id: string;
  contentType: string;
  /** The card JSON, as a string. Graph wants it serialised. */
  content: string;
}

export interface TeamsChatOptions {
  /** Cards posted with the message, referenced from the html by <attachment id="...">. */
  attachments?: TeamsChatAttachment[];
  /** Sent once instead when Graph refuses the message with its attachments. */
  fallbackHtml?: string;
}

export async function sendTeamsChatMessage(
  userAccessToken: string,
  recipient: string,
  contentHtml: string,
  options: TeamsChatOptions = {},
): Promise<TeamsChatResult> {
  try {
    // Create (or resolve) a one-on-one chat between the teacher (me) and the student.
    const chatRes = await postWithRetry(`${GRAPH}/chats`, userAccessToken, {
      chatType: 'oneOnOne',
      members: [
        {
          '@odata.type': '#microsoft.graph.aadUserConversationMember',
          roles: ['owner'],
          'user@odata.bind': `${GRAPH}/me`,
        },
        {
          '@odata.type': '#microsoft.graph.aadUserConversationMember',
          roles: ['owner'],
          'user@odata.bind': `${GRAPH}/users('${recipient}')`,
        },
      ],
    });
    if (!chatRes.ok) {
      // Shouted about rather than swallowed. A chat tier that quietly returns
      // false looks identical to a student with no Microsoft account, and the
      // two need very different fixes.
      const reason = await graphReason(chatRes);
      console.error(`Teams chat create failed for ${recipient}: ${reason}`);
      return { ok: false, status: chatRes.status, reason: `Could not start the chat (${reason})` };
    }
    const chat = await chatRes.json().catch(() => null);
    if (!chat?.id) {
      return { ok: false, status: chatRes.status, reason: 'Microsoft did not return a chat' };
    }

    const messagesUrl = `${GRAPH}/chats/${chat.id}/messages`;
    const attachments = options.attachments?.length ? options.attachments : null;
    let msgRes = await postWithRetry(messagesUrl, userAccessToken, {
      body: { contentType: 'html', content: contentHtml },
      ...(attachments ? { attachments } : {}),
    });

    // A card is the part of a message Graph is most likely to refuse: an image it
    // cannot fetch, or a schema it does not accept. The student still gets the
    // words and the link, once, as plain html.
    if (!msgRes.ok && attachments && options.fallbackHtml) {
      const cardReason = await graphReason(msgRes);
      console.error(`Teams chat card refused for ${recipient}, sending plain instead: ${cardReason}`);
      msgRes = await postWithRetry(messagesUrl, userAccessToken, {
        body: { contentType: 'html', content: options.fallbackHtml },
      });
    }
    if (!msgRes.ok) {
      const reason = await graphReason(msgRes);
      console.error(`Teams chat send failed for ${recipient}: ${reason}`);
      return { ok: false, status: msgRes.status, reason: `Could not post the message (${reason})` };
    }
    return { ok: true, status: msgRes.status };
  } catch (err) {
    console.error(`Teams chat send threw for ${recipient}:`, err);
    return { ok: false, status: 0, reason: err instanceof Error ? err.message : 'Teams chat failed' };
  }
}
