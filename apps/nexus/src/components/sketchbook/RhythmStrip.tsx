'use client';

import { Box } from '@neram/ui';
import type { StripDay } from '@/lib/sketchbook-status';

/**
 * Two weeks of drawing days as 14 small squares, last week then this week,
 * Monday to Sunday, with a wider gap between the weeks.
 *
 *   filled        drew that day (any drawing upload)
 *   light grey    a day that passed with no drawing
 *   outlined      today, still open
 *   faint dashed  a day still to come
 *   hatched       before tracking started for this student, never judged
 *
 * A picture of a pattern is not readable by a screen reader, so the whole strip
 * is one image with a sentence for a label.
 */

const SQUARE = 9;
const SQUARE_WIDE = 12;
const GAP = 2;
const WEEK_GAP = 6;

export function stripLabel(strip: StripDay[]): string {
  const count = (days: StripDay[]) => days.filter((d) => d.state === 'drew').length;
  const last = strip.slice(0, 7);
  const thisWeek = strip.slice(7);
  const lastTracked = last.some((d) => d.state !== 'before_start');
  const lastPart = lastTracked ? `Last week ${count(last)} ${count(last) === 1 ? 'day' : 'days'}.` : 'Not tracked last week.';
  return `${lastPart} This week ${count(thisWeek)} so far.`;
}

export default function RhythmStrip({ strip }: { strip: StripDay[] }) {
  return (
    <Box
      role="img"
      aria-label={stripLabel(strip)}
      sx={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}
      data-testid="rhythm-strip"
    >
      {strip.map((d, i) => (
        <Box
          key={d.date}
          data-state={d.state}
          sx={{
            // Bigger where rows are wide; 9px keeps the strip inside a 375px row.
            width: { xs: SQUARE, md: SQUARE_WIDE },
            height: { xs: SQUARE, md: SQUARE_WIDE },
            borderRadius: '2px',
            ml: i === 0 ? 0 : i === 7 ? `${WEEK_GAP}px` : `${GAP}px`,
            boxSizing: 'border-box',
            ...(d.state === 'drew' && { bgcolor: 'primary.main' }),
            ...(d.state === 'missed' && { bgcolor: 'action.disabledBackground' }),
            ...(d.state === 'open' && { border: '1.5px solid', borderColor: 'primary.main' }),
            ...(d.state === 'future' && { border: '1px dashed', borderColor: 'divider' }),
            ...(d.state === 'before_start' && {
              backgroundImage: (t) =>
                `repeating-linear-gradient(135deg, ${t.palette.divider} 0 1.5px, transparent 1.5px 3.5px)`,
            }),
            ...(d.today && d.state === 'drew' && { outline: '1.5px solid', outlineColor: 'primary.dark', outlineOffset: '1px' }),
          }}
        />
      ))}
    </Box>
  );
}
