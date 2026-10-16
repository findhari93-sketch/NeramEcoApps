'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Box } from '@neram/ui';

/**
 * Inline markdown for Aintra answers: **bold**, *italic*, `code`, [links](url)
 * and bare URLs, emails and domains made clickable.
 *
 * Links to neramclasses.com pages open in the same tab as a relative path, so a
 * visitor stays on the site and the locale is kept. Everything else opens in a
 * new tab.
 */

const INLINE = /(\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\s]+\)|`[^`\n]+`|\*[^*\s][^*\n]*\*)/g;
const BARE_LINK =
  /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|https?:\/\/[^\s,)]+|www\.[^\s,)]+|\b[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.(?:com|in|org|net|edu)(?:\/[^\s,)]*)?)/g;
const SITE_HOST = /^(?:https?:\/\/)?(?:www\.)?neramclasses\.com(\/[^\s]*)?$/i;

const linkSx = {
  color: 'primary.main',
  fontWeight: 500,
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
  overflowWrap: 'anywhere' as const,
  borderRadius: 0.5,
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
};

function SmartLink({ href, children }: { href: string; children: ReactNode }) {
  const trimmed = href.replace(/[.,;:!?]+$/, '');
  const site = SITE_HOST.exec(trimmed);
  const internal = trimmed.startsWith('/') ? trimmed : site ? site[1] || '/' : null;
  if (internal) {
    return (
      <Box component={Link} href={internal} sx={linkSx}>
        {children}
      </Box>
    );
  }
  const isEmail = /^[^\s@/]+@[^\s@]+$/.test(trimmed);
  const isPhone = trimmed.startsWith('tel:');
  const external = isEmail ? `mailto:${trimmed}` : isPhone || /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  return (
    <Box
      component="a"
      href={external}
      {...(isEmail || isPhone ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
      sx={linkSx}
    >
      {children}
    </Box>
  );
}

function Linkify({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(BARE_LINK)) {
    const index = m.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    // Keep trailing punctuation outside the link: "visit neramclasses.com/apply."
    const raw = m[0];
    const core = raw.replace(/[.,;:!?]+$/, '');
    nodes.push(
      <SmartLink key={index} href={core}>
        {core}
      </SmartLink>,
    );
    if (core.length < raw.length) nodes.push(raw.slice(core.length));
    last = index + raw.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}

export default function InlineText({ text }: { text: string }) {
  const parts = text.split(INLINE);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          return (
            <Box component="strong" key={i} sx={{ fontWeight: 700, color: 'text.primary' }}>
              <InlineText text={part.slice(2, -2)} />
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
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return (
            <Box
              component="code"
              key={i}
              sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.875em', bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5 }}
            >
              {part.slice(1, -1)}
            </Box>
          );
        }
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
          return (
            <em key={i}>
              <Linkify text={part.slice(1, -1)} />
            </em>
          );
        }
        return <Linkify key={i} text={part} />;
      })}
    </>
  );
}
