/**
 * Best-effort Microsoft Teams 1:1 chat message from the signed-in teacher (delegated token).
 *
 * Requires the teacher's Graph token to carry delegated Chat.Create + ChatMessage.Send with tenant
 * admin consent. Until that consent is in place these calls return 403 and the caller falls back to
 * in-app + email. Written so it "just works" once the scopes are granted, and never throws.
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
    if (!chatRes.ok) return false;
    const chat = await chatRes.json().catch(() => null);
    if (!chat?.id) return false;

    const msgRes = await fetch(
      `https://graph.microsoft.com/v1.0/chats/${chat.id}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${userAccessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: { contentType: 'html', content: contentHtml } }),
      },
    );
    return msgRes.ok;
  } catch {
    return false;
  }
}
