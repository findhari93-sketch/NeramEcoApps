'use client';

/**
 * One student's time in one class, drawn to scale.
 *
 * The track is the class itself, start to real end. A filled block is a stretch
 * they were in the room, a gap is a stretch they were not, so joining late,
 * leaving early and stepping out are all the same picture read in three places.
 * Plain boxes, no chart library: this renders in a list of forty rows at 375px.
 */
import { Box, useTheme } from '@neram/ui';

export default function PresenceStrip({
  held,
  segments,
  tone,
  label,
}: {
  held: { start: string; end: string };
  segments: Array<{ start: string; end: string }>;
  tone: 'success' | 'warning';
  label: string;
}) {
  const theme = useTheme();
  const startMs = Date.parse(held.start);
  const endMs = Date.parse(held.end);
  const span = Math.max(1, endMs - startMs);
  const color = tone === 'success' ? theme.palette.success.main : theme.palette.warning.main;

  const pct = (ms: number) => `${Math.max(0, Math.min(100, ((ms - startMs) / span) * 100))}%`;

  return (
    <Box
      role="img"
      aria-label={label}
      sx={{
        position: 'relative',
        height: 10,
        borderRadius: 99,
        bgcolor: theme.palette.action.hover,
        border: `1px solid ${theme.palette.divider}`,
        overflow: 'hidden',
      }}
    >
      {segments.map((s) => {
        const left = pct(Date.parse(s.start));
        const right = pct(Date.parse(s.end));
        return (
          <Box
            key={`${s.start}-${s.end}`}
            data-segment
            style={{
              left,
              width: `${parseFloat(right) - parseFloat(left)}%`,
            }}
            sx={{ position: 'absolute', top: 0, bottom: 0, bgcolor: color }}
          />
        );
      })}
    </Box>
  );
}
