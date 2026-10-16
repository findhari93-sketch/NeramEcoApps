'use client';

import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import { Link } from '@/i18n/routing';
import { iconTileSx, tokens as t, v } from './tokens';

export interface LinkTileProps {
  href: string;
  title: ReactNode;
  /** Optional 44px navy icon tile (an *Outlined icon). */
  icon?: ReactNode;
  /** One muted line under the title. */
  meta?: ReactNode;
  external?: boolean;
}

/**
 * A compact row link: icon tile + title, the whole tile clickable. Related
 * tools (T7), nearby cities (T6), "also read" lists. Hover = gold border.
 */
export default function LinkTile({ href, title, icon, meta, external }: LinkTileProps) {
  const linkProps = external
    ? { component: 'a' as const, href, target: '_blank', rel: 'noopener noreferrer' }
    : { component: Link, href };
  return (
    <Box
      {...linkProps}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        minHeight: 44,
        p: icon ? 2.25 : 2,
        boxSizing: 'border-box',
        bgcolor: v.card,
        border: `1px solid ${v.line}`,
        borderRadius: `${t.radius}px`,
        color: v.fg,
        textDecoration: 'none',
        transition: 'border-color 150ms ease',
        '&:hover': { borderColor: t.gold500, color: v.fg },
        '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
      }}
    >
      {icon && (
        <Box aria-hidden sx={{ ...iconTileSx, width: 44, height: 44 }}>
          {icon}
        </Box>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
        <Typography component="strong" sx={{ fontSize: '0.9375rem', fontWeight: 700, lineHeight: 1.35 }}>
          {title}
        </Typography>
        {meta && (
          <Typography component="span" sx={{ fontSize: '0.8125rem', color: v.muted, lineHeight: 1.4 }}>
            {meta}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
