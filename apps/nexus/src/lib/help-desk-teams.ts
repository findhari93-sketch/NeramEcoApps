/**
 * Help requests into the staff "Nexus Help Desk" Teams group chat.
 *
 * A student stuck outside Nexus (cannot load it, cannot sign in) sends a request
 * from /help. The ticket is saved in support_tickets, and this posts a card into
 * the Help Desk group chat so a person sees it within minutes instead of whenever
 * someone next opens the Admin inbox.
 *
 * Posted by Neram Assistant with the bot's own app-only token (postToConversation,
 * the path announceSessionInChat uses). No staff member has to be signed in.
 *
 * This is a message TO STAFF, so it is outside the "every message to a student
 * goes through sendNudge" rule in apps/nexus/CLAUDE.md. Nothing here ever writes
 * to a student.
 *
 * Setup, once per environment: add Neram Assistant to the group chat and mention
 * it once. /api/pad/bot/messages records the chat in pad_bot_conversations; copy
 * that row into nexus_settings.help_desk_chat as { conversation_id, service_url }.
 * Until then every request is still saved and shows in Admin, and this reports
 * 'not-configured'.
 */

import { postToConversation, type ConversationTarget } from '@/lib/pad/bot/session-card';
import { whatsAppLink } from '@/lib/support-contact';

export const HELP_DESK_CHAT_KEY = 'help_desk_chat';

export interface HelpDeskCardInput {
  ticketNumber: string;
  problemLabel: string;
  name: string;
  phone: string;
  email: string | null;
  details: string | null;
  /** "Matches Nexus student: Priya S (priya@neramclasses.com)", or null when nobody matched. */
  matchedAccount: string | null;
  device: string | null;
  appVersion: string | null;
  pageUrl: string | null;
  online: boolean | null;
  screenshotUrl: string | null;
  ticketUrl: string;
}

type CardAction = { type: 'Action.OpenUrl'; title: string; url: string; style?: 'positive' };

/** Pure, so the card is unit tested without Teams. */
export function helpDeskCardActivity(input: HelpDeskCardInput) {
  const facts: { title: string; value: string }[] = [
    { title: 'Name', value: input.name },
    { title: 'Phone', value: input.phone },
  ];
  if (input.email) facts.push({ title: 'Email', value: input.email });
  facts.push({ title: 'Account', value: input.matchedAccount ?? 'No matching Nexus account' });
  if (input.device) facts.push({ title: 'Device', value: input.device });
  if (input.online === false) facts.push({ title: 'Network', value: 'Phone was offline when this was written' });
  if (input.pageUrl) facts.push({ title: 'Page', value: input.pageUrl });
  if (input.appVersion) facts.push({ title: 'Version', value: input.appVersion });

  const body: unknown[] = [
    { type: 'TextBlock', text: `Help request ${input.ticketNumber}`, weight: 'Bolder', size: 'Medium', wrap: true },
    { type: 'TextBlock', text: input.problemLabel, color: 'Attention', weight: 'Bolder', spacing: 'Small', wrap: true },
  ];
  if (input.details) body.push({ type: 'TextBlock', text: input.details, wrap: true, spacing: 'Medium' });
  body.push({ type: 'FactSet', facts, spacing: 'Medium' });
  if (input.screenshotUrl) {
    body.push({
      type: 'Image',
      url: input.screenshotUrl,
      altText: 'Screenshot from the student',
      size: 'Stretch',
      spacing: 'Medium',
      selectAction: { type: 'Action.OpenUrl', url: input.screenshotUrl },
    });
  }

  const actions: CardAction[] = [
    { type: 'Action.OpenUrl', title: 'WhatsApp', url: whatsAppLink(input.phone), style: 'positive' },
    { type: 'Action.OpenUrl', title: 'Call', url: `tel:${input.phone}` },
    { type: 'Action.OpenUrl', title: 'Open ticket', url: input.ticketUrl },
  ];

  return {
    type: 'message',
    summary: `Help request ${input.ticketNumber}: ${input.problemLabel}`,
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          type: 'AdaptiveCard',
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          version: '1.4',
          body,
          actions,
        },
      },
    ],
  };
}

/** The Help Desk chat from nexus_settings, or null until it is set up. */
export async function readHelpDeskChat(supabase: any): Promise<ConversationTarget | null> {
  try {
    const { data } = await supabase.from('nexus_settings').select('value').eq('key', HELP_DESK_CHAT_KEY).maybeSingle();
    const value = data?.value as { conversation_id?: unknown; service_url?: unknown } | null | undefined;
    if (!value || typeof value.conversation_id !== 'string' || typeof value.service_url !== 'string') return null;
    if (!value.conversation_id || !value.service_url) return null;
    return { conversationId: value.conversation_id, serviceUrl: value.service_url };
  } catch {
    return null;
  }
}

export type HelpDeskPost = 'posted' | 'not-configured' | 'failed';

/** Post the card. Never throws: a request is saved whether or not Teams takes it. */
export async function postHelpDeskCard(
  supabase: any,
  input: HelpDeskCardInput,
  deps: { post?: typeof postToConversation } = {},
): Promise<HelpDeskPost> {
  const target = await readHelpDeskChat(supabase);
  if (!target) return 'not-configured';

  try {
    const status = await (deps.post ?? postToConversation)(target, helpDeskCardActivity(input));
    if (status >= 200 && status < 300) return 'posted';
    console.error(`[help desk] Teams refused the card for ${input.ticketNumber}: ${status || 'no response'}`);
    return 'failed';
  } catch (err) {
    console.error(`[help desk] ${input.ticketNumber}: ${err instanceof Error ? err.message : 'could not post'}`);
    return 'failed';
  }
}
