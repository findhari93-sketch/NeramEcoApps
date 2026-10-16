'use client';

import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import { Link } from '@/i18n/routing';
import { iconTileSx, tokens as t } from './tokens';

export interface HubCardProps {
  href: string;
  title: ReactNode;
  desc?: ReactNode;
  /** An *Outlined icon for the 48px navy tile. */
  icon?: ReactNode;
  /** Small pill at the top right ("Free", "Live", "TBD"). */
  badge?: ReactNode;
  /** The action line at the bottom (default "Open"). */
  cta?: ReactNode;
  external?: boolean;
  titleAs?: 'h2' | 'h3';
}

/**
 * A hub index card (T3): icon tile and badge, title, two-line description and
 * an action line. The whole card is one link; hover turns the border gold.
 */
export default function HubCard({ href, title, desc, icon, badge, cta = 'Open', external, titleAs = 'h3' }: HubCardProps) {
  const linkProps = external
    ? { component: 'a' as const, href, target: '_blank', rel: 'noopener noreferrer' }
    : { component: Link, href };
  return (
    <Box
      {...linkProps}
      sx={{
        bgcolor: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: `${t.radius}px`,
        p: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        height: '100%',
        boxSizing: 'border-box',
        color: t.ink,
        textDecoration: 'none',
        transition: 'border-color 150ms ease',
        '&:hover': { borderColor: t.gold500, color: t.ink },
        '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
      }}
    >
      {(icon || badge) && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
          {icon ? (
            <Box aria-hidden sx={iconTileSx}>
              {icon}
            </Box>
          ) : (
            <span />
          )}
          {badge && (
            <Box
              component="span"
              sx={{ fontSize: '0.75rem', fontWeight: 700, border: `1px solid ${t.line}`, borderRadius: `${t.radiusPill}px`, px: 1.25, py: '3px', color: t.inkMuted }}
            >
              {badge}
            </Box>
          )}
        </Box>
      )}
      <Typography component={titleAs} sx={{ m: 0, fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.3 }}>
        {title}
      </Typography>
      {desc && (
        <Typography
          component="p"
          sx={{
            m: 0,
            flex: 1,
            fontSize: '0.9375rem',
            lineHeight: 1.5,
            color: t.inkMuted,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {desc}
        </Typography>
      )}
      <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontWeight: 700, fontSize: '0.9375rem', '& svg': { fontSize: 18 } }}>
        {cta}
        {external ? <NorthEastIcon aria-hidden /> : <ArrowForwardIcon aria-hidden />}
      </Box>
    </Box>
  );
}
