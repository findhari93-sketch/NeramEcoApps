/**
 * Best-effort Microsoft Teams 1:1 chat message from the signed-in teacher
 * (delegated token). Requires the teacher's Graph token to carry delegated
 * Chat.Create + ChatMessage.Send with tenant admin consent, both of which are
 * already in loginScopes.nexusTeacher. Never throws.
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
 */
export async function sendTeamsChatMessage(
  userAccessToken: string,
  recipientUpn: string,
  contentHtml: string,
): Promise<boolean> {
  try {
    // Create (or resolve) a one-on-one chat between the teacher (me) and the student.
    const chatRes = await fetch('https://graph.microsoft.com/v1.0/chats', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAccessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatType: 'oneOnOne',
        members: [
          {
            '@odata.type': '#microsoft.graph.aadUserConversationMember',
            roles: ['owner'],
            'user@odata.bind': 'https://graph.microsoft.com/v1.0/me',
          },
          {
            '@odata.type': '#microsoft.graph.aadUserConversationMember',
            roles: ['owner'],
            'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${recipientUpn}')`,
          },
        ],
      }),
    });
    if (!chatRes.ok) {
      // Shouted about rather than swallowed. A chat tier that quietly returns
      // false looks identical to a student with no Microsoft account, and the
      // two need very different fixes.
      console.error(
        `Teams chat create failed for ${recipientUpn}: ${chatRes.status} ${await chatRes
          .text()
          .catch(() => '')}`.slice(0, 400),
      );
      return false;
    }
    const chat = await chatRes.json().catch(() => null);
    if (!chat?.id) return false;

    const msgRes = await fetch(`https://graph.microsoft.com/v1.0/chats/${chat.id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userAccessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: { contentType: 'html', content: contentHtml } }),
    });
    if (!msgRes.ok) {
      console.error(
        `Teams chat send failed for ${recipientUpn}: ${msgRes.status} ${await msgRes
          .text()
          .catch(() => '')}`.slice(0, 400),
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Teams chat send threw for ${recipientUpn}:`, err);
    return false;
  }
}
