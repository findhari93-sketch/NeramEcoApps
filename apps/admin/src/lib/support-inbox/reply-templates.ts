/**
 * Canned starts for staff messages. Each is a starting point to edit, never
 * sent as is without a look. Plain words, no dashes (see the content rules in
 * the root CLAUDE.md).
 */

export type TemplateUse = 'reply' | 'ask' | 'resolve' | 'close' | 'note';

export interface ReplyTemplate {
  id: string;
  label: string;
  text: string;
  uses: TemplateUse[];
}

export const REPLY_TEMPLATES: ReplyTemplate[] = [
  {
    id: 'looking',
    label: 'Looking into it',
    text: 'Thanks for telling us. We are looking into this now and will update you here.',
    uses: ['reply'],
  },
  {
    id: 'steps',
    label: 'Ask for steps',
    text: 'Could you tell us the steps you took just before this happened? A screenshot of the screen helps a lot.',
    uses: ['ask', 'reply'],
  },
  {
    id: 'refresh',
    label: 'Ask to update the app',
    text: 'Please close the app fully and open it again (or refresh the page), then try once more. Does it still happen?',
    uses: ['ask', 'reply'],
  },
  {
    id: 'device',
    label: 'Ask about the device',
    text: 'Which phone or computer are you using, and does it happen on another device or browser too?',
    uses: ['ask'],
  },
  {
    id: 'fixed',
    label: 'Fixed, please check',
    text: 'We found the problem and fixed it. Please open the page again and check. If anything still looks wrong, tap Still happening.',
    uses: ['resolve', 'close'],
  },
  {
    id: 'answered',
    label: 'Answered',
    text: 'Here is how to do it: ',
    uses: ['resolve', 'close', 'reply'],
  },
  {
    id: 'intended',
    label: 'Working as intended',
    text: 'This works this way on purpose, because ',
    uses: ['resolve', 'close'],
  },
  {
    id: 'wontfix',
    label: 'Will not change',
    text: 'Thank you for the suggestion. We have decided not to change this for now, because ',
    uses: ['close'],
  },
  {
    id: 'note-repro',
    label: 'Could not reproduce',
    text: 'Tried on the same page and could not reproduce. Next: ',
    uses: ['note'],
  },
  {
    id: 'note-handoff',
    label: 'Hand-off note',
    text: 'Context for whoever picks this up: ',
    uses: ['note'],
  },
];

export function templatesFor(use: TemplateUse): ReplyTemplate[] {
  return REPLY_TEMPLATES.filter((t) => t.uses.includes(use));
}

/** Put a template into a draft: replaces an empty draft, otherwise appends on a new line. */
export function applyTemplate(draft: string, template: ReplyTemplate): string {
  const current = draft.trimEnd();
  return current ? `${current}\n\n${template.text}` : template.text;
}
