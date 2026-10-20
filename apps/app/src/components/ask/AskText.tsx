'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';

/**
 * The answer text: short paragraphs and bullet lists with **bold**, *italic*
 * and links. Deliberately small (the numbers live on the cards, not in the
 * text). Links to this app open in place; anything else opens a new tab.
 * Adapted from Aintra's InlineText (apps/marketing/src/components/aintra/rich).
 */

const INLINE = /(\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\s]+\)|\*[^*\s][^*\n]*\*)/g;
const APP_HOST = /^(?:https?:\/\/)?app\.neramclasses\.com(\/[^\s]*)?$/i;

const linkSx = {
  color: 'primary.main',
  fontWeight: 600,
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
  overflowWrap: 'anywhere' as const,
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2, borderRadius: 0.5 },
};

function SmartLink({ href, children }: { href: string; children: ReactNode }) {
  const app = APP_HOST.exec(href);
  const internal = href.startsWith('/') ? href : app ? app[1] || '/' : null;
  if (internal) {
    return (
      <Box component={Link} href={internal} sx={linkSx}>
        {children}
      </Box>
    );
  }
  if (!/^https?:\/\//.test(href)) return <>{children}</>;
  return (
    <Box component="a" href={href} target="_blank" rel="noopener noreferrer" sx={linkSx}>
      {children}
    </Box>
  );
}

export function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(INLINE).map((part, i) => {
        if (!part) return null;
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          return (
            <Box component="strong" key={i} sx={{ fontWeight: 700, color: 'text.primary' }}>
              {part.slice(2, -2)}
            </Box>
          );
        }
        const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
        if (link) {
          return (
            <SmartLink key={i} href={link[2]}>
              {link[1]}
            </SmartLink>
          );
        }
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
        return <span key={i}>{part}</span>;
      })}
    </>
  );
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
