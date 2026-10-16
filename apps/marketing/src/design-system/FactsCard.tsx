import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import { v, tokens as t } from './tokens';

export interface FactsCardProps {
  title?: ReactNode;
  items: Array<{ label: ReactNode; value: ReactNode }>;
  /** Heading level for the title (default h2). */
  titleAs?: 'h2' | 'h3';
}

/**
 * Facts as a ruled definition list: course highlights in a hero aside, city
 * facts (T6), exam quick facts. Uses the Surface colours, so it reads as a
 * navy card on dark bands and a white card on light ones.
 */
export default function FactsCard({ title, items, titleAs = 'h2' }: FactsCardProps) {
  return (
    <Box
      sx={{
        bgcolor: v.card,
        border: `1px solid ${v.line}`,
        borderRadius: `${t.radius}px`,
        p: { xs: 2.5, sm: 3 },
        color: v.fg,
        minWidth: 0,
      }}
    >
      {title && (
        <Typography component={titleAs} sx={{ m: 0, mb: 1, fontSize: '1.0625rem', fontWeight: 700 }}>
          {title}
        </Typography>
      )}
      <Box component="dl" sx={{ m: 0 }}>
        {items.map((item, i) => (
          <Box
            key={i}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 2,
              py: 1.25,
              borderBottom: i === items.length - 1 ? 0 : `1px solid ${v.line}`,
            }}
          >
            <Box component="dt" sx={{ fontSize: '0.9375rem', color: v.muted }}>
              {item.label}
            </Box>
            <Box component="dd" sx={{ m: 0, fontSize: '0.9375rem', fontWeight: 600, textAlign: 'right' }}>
              {item.value}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
