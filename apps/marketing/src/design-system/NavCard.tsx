'use client';

import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Link } from '@/i18n/routing';
import { tokens as t } from './tokens';

export interface NavCardLink {
  label: ReactNode;
  href: string;
  external?: boolean;
  /** Marks the page you are on (aria-current, gold inset rail). */
  current?: boolean;
}

export interface NavCardProps {
  /** Small mono heading, e.g. "TNEA guides". */
  title: ReactNode;
  links: NavCardLink[];
  /** Accessible name for the nav landmark (defaults to "Related"). */
  ariaLabel?: string;
}

/**
 * A white card of 48px link rows with chevrons, for a page's side rail
 * (related guides on T5, "On this page" on legal). One per rail.
 */
export default function NavCard({ title, links, ariaLabel = 'Related' }: NavCardProps) {
  return (
    <Box
      component="nav"
      aria-label={ariaLabel}
      sx={{ bgcolor: t.surface, border: `1px solid ${t.line}`, borderRadius: `${t.radius}px`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <Typography
        component="span"
        sx={{ px: 2, pt: 1.75, pb: 0.75, fontFamily: t.fontMono, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.inkMuted }}
      >
        {title}
      </Typography>
      {links.map((l, i) => {
        const linkProps = l.external
          ? { component: 'a' as const, href: l.href, target: '_blank', rel: 'noopener noreferrer' }
          : { component: Link, href: l.href };
        return (
          <Box
            key={i}
            {...linkProps}
            aria-current={l.current ? 'page' : undefined}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 1,
              minHeight: 48,
              px: 2,
              borderTop: `1px solid ${t.line}`,
              color: t.ink,
              fontSize: '0.9375rem',
              fontWeight: l.current ? 700 : 600,
              textDecoration: 'none',
              boxShadow: l.current ? `inset 3px 0 0 ${t.gold500}` : 'none',
              transition: 'background-color 150ms ease',
              '&:hover': { bgcolor: t.ground, color: t.ink },
              '&:focus-visible': { outline: t.focusOutline, outlineOffset: '-2px' },
            }}
          >
            <span>{l.label}</span>
            <ChevronRightIcon aria-hidden sx={{ fontSize: 20, color: t.inkMuted, flexShrink: 0 }} />
          </Box>
        );
      })}
    </Box>
  );
}
