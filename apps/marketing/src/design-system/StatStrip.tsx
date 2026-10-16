import type { ReactNode } from 'react';
import { Box, Skeleton, Typography } from '@neram/ui';
import { tokens as t } from './tokens';

export interface StatItem {
  /** null while loading: shows a skeleton, never a placeholder dash. */
  value: ReactNode | null;
  label: ReactNode;
}

export interface StatStripProps {
  items: StatItem[];
  /** compact: inside the hero copy column (22px). band: full width under a hero (26px). */
  size?: 'compact' | 'band';
  /** Max width in px for the compact strip (default 520). */
  maxWidth?: number;
}

/**
 * Mono gold numbers on a 1px dark grid. Dark surfaces only. Cells are
 * separated by a 1px gap over a lineDark background, so the rules stay
 * correct when the grid wraps on phones. The label (dt) comes first in the
 * DOM for screen readers and is shown under the value with `order`.
 */
export default function StatStrip({ items, size = 'band', maxWidth = 520 }: StatStripProps) {
  const band = size === 'band';
  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        display: 'grid',
        // Two columns on phones (no empty cells for 4 items); an odd last item spans the row.
        gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: `repeat(auto-fit, minmax(${band ? 140 : 110}px, 1fr))` },
        '& > :last-child:nth-of-type(odd)': { gridColumn: { xs: '1 / -1', sm: 'auto' } },
        gap: '1px',
        bgcolor: t.lineDark,
        border: `1px solid ${t.lineDark}`,
        borderRadius: `${t.radius}px`,
        overflow: 'hidden',
        maxWidth: band ? 'none' : maxWidth,
      }}
    >
      {items.map((item, i) => (
        <Box
          key={i}
          sx={{
            bgcolor: band ? t.navy800 : t.navy900,
            px: band ? 3 : 2.25,
            py: band ? 2.5 : 1.75,
            display: 'flex',
            flexDirection: 'column',
            gap: band ? 0.75 : 0.5,
          }}
        >
          <Typography component="dt" variant="statLabel" sx={{ color: t.paperSubtle, order: 2 }}>
            {item.label}
          </Typography>
          <Typography
            component="dd"
            variant="statValue"
            sx={{ m: 0, order: 1, color: t.gold500, fontSize: band ? '1.625rem' : '1.375rem' }}
          >
            {item.value ?? (
              <Skeleton variant="text" width={64} sx={{ bgcolor: t.navy700, fontSize: 'inherit' }} />
            )}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
