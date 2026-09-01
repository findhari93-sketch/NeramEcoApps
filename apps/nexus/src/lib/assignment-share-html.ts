/**
 * The Teams card for an assignment share. SERVER ONLY.
 *
 * Split from assignment-share-model.ts for one reason: this needs buildMentions,
 * and teams-class-announcements.ts imports @neram/database. The share dialog
 * imports the model for its live preview, so anything the model imports lands in
 * the browser bundle. Keeping the two apart is what stops the Supabase admin
 * client being shipped to a teacher's phone.
 *
 * Every formatter comes from the model, so this card and the clipboard text are
 * built from the same words in the same order. Nothing here decides what the
 * message says.
 */

import { escapeHtml } from '@/lib/html-escape';
import { buildMentions } from '@/lib/teams-class-announcements';
import { safeUrl } from '@/lib/class-share-model';
import {
  closingLine,
  headline,
  metaLine,
  splitPending,
  willName,
  type AssignmentShareOptions,
  type AssignmentSharePayload,
} from '@/lib/assignment-share-model';

export interface AssignmentShareHtml {
  html: string;
  /**
   * The array Graph requires alongside any `<at id="n">` tag in the html. Empty
   * when nobody is being mentioned. NEVER assemble this separately from the
   * html: a tag whose id has no matching entry makes Graph reject the whole
   * message, which is why buildMentions returns both together.
   */
  mentions: unknown[];
}

/**
 * Render the card, and the mentions that must accompany it.
 *
 * Everything interpolated is escaped, including the title and every student
 * name: both come from the database and neither is trusted markup.
 * buildMentions escapes the display names it emits.
 *
 * Students with no ms_oid come back from buildMentions as bold text rather than
 * a mention. That is its documented behaviour and the right one here: dropping
 * them would silently shorten a list the teacher expects to be complete, and
 * failing the post over one unlinked account would lose the other twenty-nine.
 */
export function renderAssignmentShareHtml(
  p: AssignmentSharePayload,
  opts: AssignmentShareOptions,
): AssignmentShareHtml {
  const parts: string[] = [`<h3>${escapeHtml(headline(p))}</h3>`];

  const meta = metaLine(p);
  if (meta) parts.push(`<p>${escapeHtml(meta)}</p>`);

  let mentions: unknown[] = [];
  if (willName(p, opts)) {
    const { named, extra } = splitPending(p.pending);
    const built = buildMentions(named.map((s) => ({ oid: s.oid, displayName: s.name })));
    mentions = built.mentions;
    parts.push(
      `<p><strong>Still to submit (${p.pending.length}):</strong><br/>${built.html}${
        extra > 0 ? `, and ${escapeHtml(String(extra))} more` : ''
      }</p>`,
    );
  }

  const url = safeUrl(p.shareUrl);
  if (url) {
    parts.push(`<p><a href="${escapeHtml(url)}">Open the assignment</a></p>`);
  }

  parts.push(`<p>${escapeHtml(closingLine(p))}</p>`);

  return { html: parts.join('\n'), mentions };
}
