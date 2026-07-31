/**
 * One HTML escaper for everything that builds a Teams card.
 *
 * There used to be a private copy in teams-class-announcements.ts. Its doc
 * comment records why it exists at all: a class called "Angles < 90 & > 45"
 * produced a card Teams rendered as garbage, silently, because Graph accepts
 * the malformed markup and does its best.
 *
 * This version also escapes the double quote, which the old one did not. The
 * share renderer emits `href="..."`, and a URL or title carrying a quote would
 * otherwise close the attribute and let the rest of the string become markup.
 */
export function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
