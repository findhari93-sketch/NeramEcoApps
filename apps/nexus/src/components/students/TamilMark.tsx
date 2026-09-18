'use client';

import { Box, type SxProps, type Theme } from '@neram/ui';
import { TAMIL_BADGE_LETTER, TAMIL_FONT_STACK } from '@/lib/student-language';

/**
 * The "knows Tamil" mark: the letter த on an ink disc.
 *
 * One component for every place the mark appears (the avatar corner, the filter
 * chip, the profile chip, the Set stage sheet), so a teacher learns one shape.
 *
 * Neutral ink rather than a colour, on purpose. The ring already spends five
 * colours on the study stage and the presence dot spends four more, so any hue
 * here would read as one of those. text.primary on background.paper also flips
 * by itself in dark mode.
 *
 * Decorative (aria-hidden): whatever it sits in carries the words.
 */
export default function TamilMark({
  size = 16,
  sx,
  testId,
}: {
  size?: number;
  sx?: SxProps<Theme>;
  testId?: string;
}) {
  return (
    <Box
      component="span"
      aria-hidden
      data-testid={testId}
      sx={[
        {
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: '50%',
          display: 'inline-grid',
          placeItems: 'center',
          bgcolor: 'text.primary',
          color: 'background.paper',
          fontFamily: TAMIL_FONT_STACK,
          fontWeight: 800,
          fontSize: Math.round(size * 0.62),
          lineHeight: 1,
          userSelect: 'none',
          pointerEvents: 'none',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {TAMIL_BADGE_LETTER}
    </Box>
  );
}
