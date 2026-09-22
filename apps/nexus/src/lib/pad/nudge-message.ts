/**
 * The words a nudge carries, and what the console says after one.
 *
 * The founder asked for a polite, templated message: a student who has not
 * answered is asked to, told a guess is fine, and shown the way out ("I can't
 * answer") rather than scolded. {firstName} is filled per student by sendNudge.
 */

export function nudgeMessage(title: string): { subject: string; plain: string } {
  return {
    subject: `${title} is waiting for your answer`,
    plain:
      `Hi {firstName}, we're on ${title} in class now. Please answer on the Answer Pad in the meeting. ` +
      "A guess is fine, or tap I can't answer and tell me why.",
  };
}

/** What POST /api/pad/prompts/:id/nudge answers. */
export interface NudgeResult {
  inPad: number;
  chat: number;
  chatDelivered: number;
}

/** What the teacher reads after pressing Nudge. Counts only, as the route answers. */
export function nudgeResultMessage(result: NudgeResult): string {
  const total = result.inPad + result.chat;
  if (total === 0) return 'Everyone has answered or said why not.';
  const parts: string[] = [];
  if (result.inPad > 0) parts.push(`${result.inPad} on their pad`);
  if (result.chat > 0) parts.push(`${result.chat} by Teams chat`);
  const lead = `Nudged ${parts.join(' and ')}.`;
  if (result.chat > 0 && result.chatDelivered < result.chat) {
    const missed = result.chat - result.chatDelivered;
    return `${lead} ${missed} ${missed === 1 ? 'chat' : 'chats'} could not be sent, so ${missed === 1 ? 'that student gets' : 'they get'} a Nexus notification instead.`;
  }
  return lead;
}
