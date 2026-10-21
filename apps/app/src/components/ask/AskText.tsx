'use client';

import { Box, Typography } from '@neram/ui';
import InlineMarkdown, { siteLinks } from '@neram/ui/chat-text';

/**
 * The answer text: short paragraphs and bullet lists with **bold**, *italic*
 * and links. Deliberately small (the numbers live on the cards, not in the
 * text). Links to this app open in place; anything else opens a new tab.
 */

// Links to app.neramclasses.com stay in the app; the renderer is shared with
// Aintra (packages/ui/src/chat/InlineMarkdown.tsx).
const APP_LINKS = siteLinks(/^(?:https?:\/\/)?app\.neramclasses\.com(\/[^\s]*)?$/i);

export function Inline({ text }: { text: string }) {
  return <InlineMarkdown text={text} internalPath={APP_LINKS} linkify />;
}

type Block = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] } | { kind: 'ol'; items: string[] };

/** Splits text into paragraphs and lists. Headings are flattened to bold lines. */
export function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    const last = blocks[blocks.length - 1];
    if (!line) {
      blocks.push({ kind: 'p', text: '' });
      continue;
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet) {
      if (last?.kind === 'ul') last.items.push(bullet[1]);
      else blocks.push({ kind: 'ul', items: [bullet[1]] });
    } else if (numbered) {
      if (last?.kind === 'ol') last.items.push(numbered[1]);
      else blocks.push({ kind: 'ol', items: [numbered[1]] });
    } else {
      const heading = /^#{1,6}\s+(.*)$/.exec(line);
      const t = heading ? `**${heading[1].replace(/\*\*/g, '')}**` : line;
      if (last?.kind === 'p' && last.text) last.text += ` ${t}`;
      else blocks.push({ kind: 'p', text: t });
    }
  }
  return blocks.filter((b) => b.kind !== 'p' || b.text);
}

export default function AskText({ text }: { text: string }) {
  const blocks = toBlocks(text);
  return (
    <Box sx={{ display: 'grid', gap: 1, fontSize: '1rem', lineHeight: 1.6, color: 'text.primary', overflowWrap: 'anywhere' }}>
      {blocks.map((b, i) =>
        b.kind === 'p' ? (
          <Typography key={i} component="p" sx={{ m: 0, fontSize: 'inherit', lineHeight: 'inherit' }}>
            <Inline text={b.text} />
          </Typography>
        ) : (
          <Box key={i} component={b.kind} sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5 }}>
            {b.items.map((item, j) => (
              <Box component="li" key={j} sx={{ pl: 0.25 }}>
                <Inline text={item} />
              </Box>
            ))}
          </Box>
        )
      )}
    </Box>
  );
}
