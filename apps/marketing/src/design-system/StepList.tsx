import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import { tokens as t, v } from './tokens';

export interface StepItem {
  title: ReactNode;
  body?: ReactNode;
}

export interface StepListProps {
  items: StepItem[];
  /** Minimum card width before the grid wraps (default 250). */
  columnMin?: number;
  /** Heading level for each step title (default h3). */
  titleAs?: 'h3' | 'h4';
}

/**
 * "How it works": an ordered list of white cards, each with a mono 01, 02...
 * number in gold800. Reflows from four across to one column on phones.
 */
export default function StepList({ items, columnMin = 250, titleAs = 'h3' }: StepListProps) {
  return (
    <Box
      component="ol"
      sx={{
        m: 0,
        p: 0,
        listStyle: 'none',
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${columnMin}px), 1fr))`,
        gap: { xs: 2, md: 2.5 },
      }}
    >
      {items.map((step, i) => (
        <Box
          component="li"
          key={i}
          sx={{
            bgcolor: v.card,
            border: `1px solid ${v.line}`,
            borderRadius: `${t.radius}px`,
            p: 3,
            display: 'flex',
            flexDirection: 'column',
            gap: 1.25,
            color: v.fg,
          }}
        >
          <Box component="span" aria-hidden sx={{ fontFamily: t.fontMono, fontSize: '0.8125rem', fontWeight: 700, color: v.eyebrow }}>
            {String(i + 1).padStart(2, '0')}
          </Box>
          <Typography component={titleAs} sx={{ m: 0, fontSize: '1.0625rem', fontWeight: 700, lineHeight: 1.35 }}>
            {step.title}
          </Typography>
          {step.body && (
            <Typography component="p" sx={{ m: 0, fontSize: '0.9375rem', lineHeight: 1.55, color: v.muted }}>
              {step.body}
            </Typography>
          )}
        </Box>
      ))}
    </Box>
  );
}
