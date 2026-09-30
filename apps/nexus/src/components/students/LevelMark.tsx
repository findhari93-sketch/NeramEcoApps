'use client';

import { Box, alpha, type SxProps, type Theme } from '@neram/ui';
import { LEVEL_BARS, type LevelKey } from '@/lib/student-level';

/**
 * Signal bars: 3 for Top, 2 for Mid, 1 for Needs practice. Everyone already
 * reads bars as "strength", so the mark needs no legend to be understood, and it
 * is a SHAPE difference, never colour alone.
 *
 * `LevelBars` is the bare icon, for chips, menus and filter pills. `LevelMark` is
 * the same bars on the purple disc that sits in the avatar's top-left corner.
 * Purple is the brand primary and the one hue the ring (five stage colours) and
 * the presence dot (four more) do not already spend, so it reads as its own thing
 * at a glance. One component for every place the bars appear, so a teacher learns
 * one shape once.
 *
 * Decorative (aria-hidden). Whatever holds it carries the words.
 */

const HEIGHTS = [4, 7, 10];

export function LevelBars({
  level,
  size = 16,
  color = 'currentColor',
  emptyColor,
}: {
  level: LevelKey;
  size?: number;
  color?: string;
  /** The unfilled bars. Defaults to the filled colour at low opacity. */
  emptyColor?: string;
}) {
  const filled = LEVEL_BARS[level];
  return (
    <Box
      component="svg"
      viewBox="0 0 14 14"
      width={size}
      height={size}
      aria-hidden
      data-level={level}
      sx={{ display: 'block', flexShrink: 0 }}
    >
      {HEIGHTS.map((h, i) => (
        <rect
          key={h}
          x={2 + i * 3.6}
          y={11.5 - h}
          width={2.6}
          height={h}
          rx={0.8}
          fill={i < filled ? color : emptyColor ?? color}
          fillOpacity={i < filled ? 1 : emptyColor ? 1 : 0.32}
        />
      ))}
    </Box>
  );
}

export default function LevelMark({
  level,
  size = 16,
  sx,
  testId,
}: {
  level: LevelKey;
  size?: number;
  sx?: SxProps<Theme>;
  testId?: string;
}) {
  return (
    <Box
      component="span"
      aria-hidden
      data-testid={testId}
      data-level={level}
      sx={[
        (theme) => ({
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: '50%',
          display: 'inline-grid',
          placeItems: 'center',
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          pointerEvents: 'none',
          // Keeps the faint bars visible on the disc in both themes.
          '--level-empty': alpha(theme.palette.primary.contrastText, 0.4),
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <LevelBars level={level} size={Math.round(size * 0.82)} color="currentColor" emptyColor="var(--level-empty)" />
    </Box>
  );
}
