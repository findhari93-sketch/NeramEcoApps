'use client';

import { Box, Typography, alpha, useTheme } from '@neram/ui';
import { daysBetweenYmd, formatDay } from '@/lib/away-windows';

/**
 * One away window drawn against the period on screen.
 *
 * Every date here is a YYYY-MM-DD string and none of them is converted. This is
 * why it does not reuse PresenceStrip, which takes ISO datetimes and parses
 * them: away-windows.ts opens by saying that the last bug on this screen was a
 * date range silently shifted by a timezone conversion, and a rule that never
 * converts cannot shift. Day counts are all this needs, and day counts are what
 * daysBetweenYmd returns.
 *
 * An open-ended window is drawn running off the right edge with a fade, never
 * stopped with a hard cap, because a hard cap states a return date the student
 * explicitly said they did not have.
 */
export default function AwayRangeBar({
  rangeStart,
  rangeEnd,
  startsOn,
  endsOn,
  showScale = false,
}: {
  rangeStart: string;
  rangeEnd: string;
  startsOn: string;
  /** Null means open ended. */
  endsOn: string | null;
  /** Print the two endpoints beneath, so the bar is anchored to real dates. */
  showScale?: boolean;
}) {
  const theme = useTheme();

  // Inclusive of both ends: a range of one day is one day wide, not zero.
  const span = daysBetweenYmd(rangeStart, rangeEnd) + 1;
  if (span <= 0) return null;

  const clamp = (n: number) => Math.min(Math.max(n, 0), span);
  const from = clamp(daysBetweenYmd(rangeStart, startsOn));
  const runsPast = !endsOn || endsOn > rangeEnd;
  const to = runsPast ? span : clamp(daysBetweenYmd(rangeStart, endsOn) + 1);

  const left = (from / span) * 100;
  // A one-day window inside a month would round to under a pixel. PresenceStrip
  // keeps the same floor for the same reason: a window that exists has to be
  // visible, even when the range dwarfs it.
  const width = Math.max(((to - from) / span) * 100, 2);

  const label = endsOn
    ? `Away ${formatDay(startsOn)} to ${formatDay(endsOn)}`
    : `Away from ${formatDay(startsOn)}, no return date yet`;

  const ink = theme.palette.text.secondary;

  return (
    <Box sx={{ width: '100%' }}>
      <Box
        role="img"
        aria-label={label}
        sx={{
          position: 'relative',
          height: 8,
          borderRadius: 999,
          bgcolor: alpha(theme.palette.text.primary, 0.08),
          overflow: 'hidden',
        }}
      >
        <Box
          aria-hidden
          data-away-bar="1"
          data-open-ended={runsPast ? '1' : undefined}
          // Geometry inline, styling in sx, as PresenceStrip does.
          style={{ left: `${left}%`, width: `${width}%` }}
          sx={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            borderRadius: 999,
            background: `repeating-linear-gradient(135deg, ${alpha(ink, 0.55)} 0 3px, ${alpha(ink, 0.22)} 3px 6px)`,
            ...(runsPast
              ? { WebkitMaskImage: 'linear-gradient(to right, #000 78%, transparent 100%)', maskImage: 'linear-gradient(to right, #000 78%, transparent 100%)' }
              : {}),
          }}
        />
      </Box>
      {showScale && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.25 }}>
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.625rem' }}>
            {formatDay(rangeStart)}
          </Typography>
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.625rem' }}>
            {formatDay(rangeEnd)}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
