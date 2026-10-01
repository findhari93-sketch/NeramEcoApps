'use client';

/**
 * The time left on a timed question: "0:42" with a timer icon, on the
 * student pad and in the teacher console. The last ten seconds change the
 * icon as well as the colour, so the warning never rests on colour alone.
 *
 * Screen readers hear it twice, not every second: once when ten seconds or
 * fewer are left, and once at 0.
 */

import { useRef } from 'react';
import { Box, Chip, alpha, useTheme } from '@neram/ui';
import HourglassBottomRounded from '@mui/icons-material/HourglassBottomRounded';
import TimerOffRounded from '@mui/icons-material/TimerOffRounded';
import TimerOutlined from '@mui/icons-material/TimerOutlined';
import { clockLabel } from '@/lib/pad/client/server-clock';
import LiveAnnouncement from './LiveAnnouncement';

export const WARNING_SECONDS = 10;

/** What the live region says: nothing, then "10 seconds left" once, then "Time is up". */
export function countdownAnnouncement(seconds: number, warnedAt: number | null): string {
  if (seconds <= 0) return 'Time is up';
  if (warnedAt !== null) return `${warnedAt} seconds left`;
  return '';
}

export default function PadCountdown({ seconds, size = 'medium' }: { seconds: number; size?: 'small' | 'medium' }) {
  const theme = useTheme();
  // The number first heard, kept while it ticks down, so the region speaks once.
  const warnedAt = useRef<number | null>(null);
  if (seconds > WARNING_SECONDS) warnedAt.current = null;
  else if (seconds > 0 && warnedAt.current === null) warnedAt.current = seconds;

  const up = seconds <= 0;
  const warning = seconds <= WARNING_SECONDS;
  const label = up ? 'Time is up' : clockLabel(seconds);
  const icon = up ? <TimerOffRounded /> : warning ? <HourglassBottomRounded /> : <TimerOutlined />;

  return (
    <Box component="span" sx={{ display: 'inline-flex', flexShrink: 0 }}>
      <Chip
        role="timer"
        aria-label={up ? 'Time is up' : `${label} left`}
        icon={icon}
        label={label}
        size={size}
        variant="outlined"
        sx={{
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          minWidth: up ? undefined : 76,
          ...(warning
            ? {
                color: theme.palette.mode === 'dark' ? theme.palette.warning.light : theme.palette.warning.dark,
                borderColor: theme.palette.warning.main,
                bgcolor: alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.2 : 0.12),
                '& .MuiChip-icon': { color: 'inherit' },
              }
            : {}),
        }}
      />
      <LiveAnnouncement message={countdownAnnouncement(seconds, warnedAt.current)} />
    </Box>
  );
}
