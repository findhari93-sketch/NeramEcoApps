import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import { tokens as t } from './tokens';

export interface FactGridProps {
  items: Array<{ label: ReactNode; value: ReactNode }>;
  /** Minimum cell width before the grid wraps (default 200). */
  cellMin?: number;
}

/**
 * "At a glance" facts as a white grid of label/value cells (T5, T4 KPIs).
 * One 1px frame, hairlines between cells; reflows to one column on phones.
 * FactsCard is the stacked version for a narrow aside.
 */
export default function FactGrid({ items, cellMin = 200 }: FactGridProps) {
  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${cellMin}px), 1fr))`,
        border: `1px solid ${t.line}`,
        borderRadius: `${t.radius}px`,
        overflow: 'hidden',
        bgcolor: t.surface,
        // Cells draw right and bottom hairlines; the frame's overflow clips the outer ones.
        '& > div': { mr: '-1px', mb: '-1px' },
      }}
    >
      {items.map((item, i) => (
        <Box
          key={i}
          sx={{
            p: 2,
            borderRight: `1px solid ${t.line}`,
            borderBottom: `1px solid ${t.line}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.5,
            minWidth: 0,
          }}
        >
          <Typography component="dt" sx={{ fontSize: '0.8125rem', color: t.inkMuted, lineHeight: 1.4 }}>
            {item.label}
          </Typography>
          <Typography component="dd" sx={{ m: 0, fontSize: '1rem', fontWeight: 700, color: t.ink, lineHeight: 1.4 }}>
            {item.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
