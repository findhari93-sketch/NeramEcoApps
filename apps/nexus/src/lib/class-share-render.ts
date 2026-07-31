/**
 * Turn share sections into the two shapes a teacher actually sends.
 *
 * renderShareText goes on the clipboard (Teams, WhatsApp, email, anywhere).
 * renderShareHtml goes to Graph as a chatMessage body.
 *
 * Both walk the SAME ShareSection[] from class-share-model.ts. That is the
 * whole point: the previous generation of this feature had one builder for
 * WhatsApp and separate hand-written HTML per Teams card, and they said
 * different things. A unit test asserts the two outputs carry an identical set
 * of URLs, which is what stops them drifting again.
 *
 * Pure and client-safe.
 */

import { escapeHtml } from '@/lib/html-escape';
import type { ShareLine, ShareSection, ShareSectionId } from '@/lib/class-share-model';

/** Sections the teacher ticked. Header and footer are always emitted. */
function keep(sections: ShareSection[], enabled: Set<ShareSectionId>): ShareSection[] {
  return sections.filter((s) => !s.toggleable || enabled.has(s.id));
}

function textLine(line: ShareLine): string {
  const prefix = line.bullet ? '• ' : '';
  const emoji = line.emoji ? `${line.emoji} ` : '';
  const body = line.muted ? `(${line.text})` : line.text;
  return `${prefix}${emoji}${body}${line.url ? `: ${line.url}` : ''}`;
}

export function renderShareText(sections: ShareSection[], enabled: Set<ShareSectionId>): string {
  const blocks: string[] = [];

  for (const section of keep(sections, enabled)) {
    const lines: string[] = [];
    if (section.heading) {
      lines.push(`${section.heading.emoji} ${section.heading.text}`);
    }
    for (const line of section.lines) {
      lines.push(textLine(line));
    }
    if (lines.length) blocks.push(lines.join('\n'));
  }

  // One blank line between blocks. Joining with '\n\n' rather than pushing
  // separators keeps a deselected section from leaving a doubled gap behind.
  return blocks.join('\n\n');
}

function htmlLine(line: ShareLine): string {
  const emoji = line.emoji ? `${line.emoji} ` : '';
  const label = `${emoji}${escapeHtml(line.text)}`;
  const body = line.url ? `<a href="${escapeHtml(line.url)}">${label}</a>` : label;
  if (line.muted) return `<em>${body}</em>`;
  return line.strong ? `<strong>${body}</strong>` : body;
}

export function renderShareHtml(sections: ShareSection[], enabled: Set<ShareSectionId>): string {
  const out: string[] = [];

  for (const section of keep(sections, enabled)) {
    if (section.heading) {
      const head = `${section.heading.emoji} ${escapeHtml(section.heading.text)}`;
      // The class title leads the card, so it gets the <h3> the other Teams
      // cards use. Every later heading is a bold paragraph, matching
      // buildWrapUpHtml's "What we did" treatment.
      out.push(section.id === 'header' ? `<h3>${head}</h3>` : `<p><strong>${head}</strong></p>`);
    }

    // Consecutive bullets collapse into one <ul>. Without this a three item
    // homework list renders as three separate single item lists, which Teams
    // spaces out as if they were unrelated.
    let bullets: string[] = [];
    const flush = () => {
      if (bullets.length) {
        out.push(`<ul>${bullets.map((b) => `<li>${b}</li>`).join('')}</ul>`);
        bullets = [];
      }
    };

    let paragraph: string[] = [];
    const flushParagraph = () => {
      if (paragraph.length) {
        out.push(`<p>${paragraph.join('<br/>')}</p>`);
        paragraph = [];
      }
    };

    for (const line of section.lines) {
      if (line.bullet) {
        flushParagraph();
        bullets.push(htmlLine(line));
      } else {
        flush();
        paragraph.push(htmlLine(line));
      }
    }
    flush();
    flushParagraph();
  }

  return out.join('\n');
}

/**
 * Every URL the message will carry, in order.
 *
 * Used by the anti-drift test and by the dialog when it wants to warn that a
 * link points at a student surface a feature flag has switched off.
 */
export function shareUrls(sections: ShareSection[], enabled: Set<ShareSectionId>): string[] {
  return keep(sections, enabled)
    .flatMap((s) => s.lines)
    .map((l) => l.url)
    .filter((u): u is string => !!u);
}
