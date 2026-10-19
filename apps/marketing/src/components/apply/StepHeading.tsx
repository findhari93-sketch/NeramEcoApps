'use client';

import { Box, Typography } from '@neram/ui';
import { tokens as t } from '@/design-system';
import { DESK } from './shell/density';

interface StepHeadingProps {
  title: string;
  subtitle?: string;
  /** Extra lines under the subtitle, such as the application number on the pay step. */
  children?: React.ReactNode;
}

/**
 * The step title (Inter 800) and its one-line subtitle, shared by every step.
 * On a laptop the subtitle sits beside the title when it fits, saving a row.
 */
export default function StepHeading({ title, subtitle, children }: StepHeadingProps) {
  return (
    <Box
      sx={{
        mb: 3.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        [DESK]: { mb: 2, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 1.5, rowGap: 0.5 },
      }}
    >
      <Typography
        component="h1"
        sx={{
          m: 0,
          fontSize: 'clamp(2rem, 4.5vw, 3rem)',
          [DESK]: { fontSize: 'clamp(1.625rem, 0.9rem + 0.9vw, 2rem)' },
          lineHeight: 1.08,
          letterSpacing: '-0.01em',
          fontWeight: 800,
          color: t.ink,
          textWrap: 'balance',
        }}
      >
        {title}
      </Typography>
      {subtitle && (
        <Typography component="p" sx={{ m: 0, fontSize: 17, lineHeight: 1.55, color: t.inkMuted, textWrap: 'pretty', [DESK]: { fontSize: 15 } }}>
          {subtitle}
        </Typography>
      )}
      {children && <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, [DESK]: { flexBasis: '100%' } }}>{children}</Box>}
    </Box>
  );
}
