'use client';

import InlineMarkdown, { siteLinks } from '@neram/ui/chat-text';

/**
 * Inline markdown for Aintra answers: **bold**, *italic*, `code`, [links](url)
 * and bare URLs, emails and domains made clickable. The renderer is shared with
 * Aintra (Tools app) (packages/ui/src/chat/InlineMarkdown.tsx).
 *
 * Links to neramclasses.com pages open in the same tab as a relative path, so a
 * visitor stays on the site and the locale is kept. Everything else opens in a
 * new tab.
 */
const SITE = siteLinks(/^(?:https?:\/\/)?(?:www\.)?neramclasses\.com(\/[^\s]*)?$/i);

export default function InlineText({ text }: { text: string }) {
  return <InlineMarkdown text={text} internalPath={SITE} linkify />;
}
