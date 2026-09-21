'use client';

import { Box, alpha, useTheme } from '@neram/ui';
import { announce, barSegments } from '@/lib/class-availability';
import { REDUCED_MOTION_QUERY } from './timetable-theme';
import type { RsvpSummary } from '@/app/api/timetable/rsvp-dashboard/route';

/**
 * The expected headcount as one bar, measured against the full roll.
 *
 * Three plain boxes over a track, modelled on the attendance PresenceStrip. No
 * chart library: this is one number split three ways, and a dependency that
 * renders it would be larger than the feature.
 *
 * The away block is hatched as well as coloured. RegisterGrid makes the same
 * point in the other direction, drawing away cells with full ink and no tint so
 * they read as settled rather than alarming: either way the rule is that colour
 * is never the only thing carrying "this absence was declared".
 */
export default function ExpectedBar({
  summary,
  atRisk = 0,
  label,
  height = 8,
}: {
  summary: RsvpSummary;
  /**
   * Expected students whose attendance record says they will not be there.
   * Carved out of the solid block so its length reads as the realistic count.
   */
  atRisk?: number;
  /** Overrides the accessible name when the caller knows the fuller sentence. */
  label?: string;
  height?: number;
}) {
  const theme = useTheme();
  const segments = barSegments(summary, atRisk);

  const fill = (key: string) => {
    if (key === 'attending') return theme.palette.success.main;
    // The same green, broken up, NOT a third hue. These students are counted
    // and may well turn up; the bar should read "do not bank on this part",
    // which a warning colour would overstate into "these are a problem".
    //
    // Striped rather than merely faded, on the same rule the away block
    // follows: a lighter shade of the neighbouring colour is exactly what a
    // colour-blind or low-contrast reader cannot separate, so the pattern has
    // to carry it. Finer than the away hatch so the two never read as one.
    if (key === 'at_risk') {
      const green = theme.palette.success.main;
      return `repeating-linear-gradient(135deg, ${alpha(green, 0.85)} 0 2px, ${alpha(green, 0.25)} 2px 4px)`;
    }
    if (key === 'declined') return theme.palette.error.main;
    // Hatched, and deliberately not a warning colour: a declared window is not
    // a problem to fix, it is a fact to plan around.
    const ink = theme.palette.text.secondary;
    return `repeating-linear-gradient(135deg, ${alpha(ink, 0.55)} 0 3px, ${alpha(ink, 0.22)} 3px 6px)`;
  };

  return (
    <Box
      role="img"
      aria-label={label || announce(summary)}
      sx={{
        display: 'flex',
        width: '100%',
        height,
        borderRadius: 999,
        overflow: 'hidden',
        bgcolor: alpha(theme.palette.text.primary, 0.08),
      }}
    >
      {segments.map((s) => (
        <Box
          key={s.key}
          aria-hidden
          data-segment={s.key}
          // Geometry inline, styling in sx. Same split as the attendance
          // PresenceStrip: an sx width compiles to a generated class, which is
          // unreadable from a test and from anything inspecting the DOM.
          style={{ width: `${s.pct}%` }}
          sx={{
            background: fill(s.key),
            transition: 'width 200ms',
            [REDUCED_MOTION_QUERY]: { transition: 'none' },
          }}
        />
      ))}
    </Box>
  );
}
