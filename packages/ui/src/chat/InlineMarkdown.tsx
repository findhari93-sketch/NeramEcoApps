'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Box } from '@mui/material';

/**
 * Inline markdown for chat answers: **bold**, *italic*, `code`, [links](url)
 * and, when `linkify` is on, bare URLs, emails and domains made clickable.
 * Shared by Aintra (apps/marketing) and Aintra (Tools app) (apps/app).
 *
 * `internalPath` decides which links stay in the app: return a path ("/apply")
 * for a link to this site and it opens in the same tab through next/link;
 * return null and it opens in a new tab.
 */

const INLINE = /(\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\s]+\)|`[^`\n]+`|\*[^*\s][^*\n]*\*)/g;
const BARE_LINK =
  /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|https?:\/\/[^\s,)]+|www\.[^\s,)]+|\b[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.(?:com|in|org|net|edu)(?:\/[^\s,)]*)?)/g;

export interface InlineMarkdownProps {
  text: string;
  /** The in-app path for a link to this site, or null for an outside link. */
  internalPath?: (href: string) => string | null;
  /** Turn bare URLs, emails and domains into links. */
  linkify?: boolean;
}

const linkSx = {
  color: 'primary.main',
  fontWeight: 500,
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
  overflowWrap: 'anywhere' as const,
  borderRadius: 0.5,
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
};

/** Paths only: "/apply" stays in the app, anything else leaves it. */
const pathsOnly = (href: string) => (href.startsWith('/') ? href : null);

function SmartLink({ href, children, internalPath }: { href: string; children: ReactNode; internalPath: (href: string) => string | null }) {
  const trimmed = href.replace(/[.,;:!?]+$/, '');
  const internal = trimmed.startsWith('/') ? trimmed : internalPath(trimmed);
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

function Linkify({ text, internalPath }: { text: string; internalPath: (href: string) => string | null }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(BARE_LINK)) {
    const index = m.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    // Keep trailing punctuation outside the link: "visit neramclasses.com/apply."
    const raw = m[0];
    const core = raw.replace(/[.,;:!?]+$/, '');
    nodes.push(
      <SmartLink key={index} href={core} internalPath={internalPath}>
        {core}
      </SmartLink>
    );
    if (core.length < raw.length) nodes.push(raw.slice(core.length));
    last = index + raw.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}

export default function InlineMarkdown({ text, internalPath = pathsOnly, linkify = true }: InlineMarkdownProps) {
  const plain = (t: string, key?: number) => (linkify ? <Linkify key={key} text={t} internalPath={internalPath} /> : <span key={key}>{t}</span>);
  const parts = text.split(INLINE);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          return (
            <Box component="strong" key={i} sx={{ fontWeight: 700, color: 'text.primary' }}>
              <InlineMarkdown text={part.slice(2, -2)} internalPath={internalPath} linkify={linkify} />
            </Box>
          );
        }
        const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
        if (link) {
          return (
            <SmartLink key={i} href={link[2]} internalPath={internalPath}>
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
          return <em key={i}>{plain(part.slice(1, -1))}</em>;
        }
        return plain(part, i);
      })}
    </>
  );
}

/** Builds an `internalPath` for one site: its links become in-app paths. */
export function siteLinks(host: RegExp): (href: string) => string | null {
  return (href) => {
    const m = host.exec(href);
    return m ? m[1] || '/' : null;
  };
}
