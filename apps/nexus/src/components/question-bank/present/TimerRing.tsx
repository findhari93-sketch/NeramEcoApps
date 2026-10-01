'use client';

/**
 * The countdown on the shared screen: a ring that empties, with the seconds
 * inside. Turns to the warning colour in the last ten seconds and reads
 * "Time up" at zero. With reduced motion the ring steps instead of gliding.
 */

import { Box, Typography, useMediaQuery } from '@neram/ui';
import { clockLabel } from '@/lib/pad/client/server-clock';

const SIZE = 64;
const STROKE = 6;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function TimerRing({ secondsLeft, total }: { secondsLeft: number; total: number | null }) {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const fraction = total && total > 0 ? Math.min(1, Math.max(0, secondsLeft / total)) : 1;
  const urgent = secondsLeft <= 10;
  const done = secondsLeft <= 0;
  const color = done ? 'text.secondary' : urgent ? 'warning.dark' : 'primary.main';

  return (
    <Box
      role="timer"
      aria-label={done ? 'Time is up' : `${clockLabel(secondsLeft)} left`}
      sx={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0 }}
    >
      <Box component="svg" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden sx={{ transform: 'rotate(-90deg)' }}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={STROKE} stroke="currentColor" opacity={0.15} />
        <Box
          component="circle"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          sx={{ stroke: 'currentColor', color, transition: reduceMotion ? 'none' : 'stroke-dashoffset 250ms linear, color 200ms' }}
        />
      </Box>
      <Typography
        component="span"
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          fontWeight: 800,
          fontSize: done ? 13 : 18,
          fontVariantNumeric: 'tabular-nums',
          color,
        }}
      >
        {done ? 'Time up' : clockLabel(secondsLeft)}
      </Typography>
    </Box>
  );
}
