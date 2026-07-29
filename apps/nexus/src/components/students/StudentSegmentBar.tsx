'use client';

import { Box, Chip, Tooltip, Typography, alpha, useTheme } from '@neram/ui';
import {
  SEGMENT_LABEL,
  SEGMENT_ORDER,
  SEGMENT_TOOLTIP,
  STAGE_COLOR,
  STAGE_COLOR_DARK,
  dormantColor,
  type StudentSegment,
} from '@/lib/student-stage';

/**
 * The priority filter.
 *
 * Ordered by how much a teacher should care today, not alphabetically and not by
 * size: "Exam this year" first because those are the students actually sitting
 * the exam, "Not set" and "Dormant" last because they are data-hygiene work
 * rather than teaching work.
 *
 * Counts are computed server-side over the COMPLETE roster, so every pill shows
 * its true size regardless of which pill is currently active. A pill that reads
 * "Dormant (3)" while you are looking at "Exam this year" is telling you
 * something real.
 *
 * Horizontally scrollable rather than wrapping: at 375px six pills will not fit,
 * and a wrapped second row pushes the list itself below the fold.
 */

/** Each segment's accent, so the active pill echoes the colour of its chips. */
function segmentColor(segment: StudentSegment, mode: 'light' | 'dark'): string {
  const palette = mode === 'dark' ? STAGE_COLOR_DARK : STAGE_COLOR;
  switch (segment) {
    case 'exam_this_year':
      return palette.gap_year;
    case '11th':
      return palette['11th'];
    case 'lower':
      return palette['10th'];
    case 'unset':
      return palette.unset;
    case 'dormant':
      return dormantColor(mode);
    default:
      return mode === 'dark' ? '#A78BFA' : '#7C3AED'; // all_active: the Nexus primary
  }
}

export default function StudentSegmentBar({
  value,
  counts,
  onChange,
}: {
  value: StudentSegment;
  counts: Record<StudentSegment, number>;
  onChange: (segment: StudentSegment) => void;
}) {
  const theme = useTheme();
  const mode = theme.palette.mode === 'dark' ? 'dark' : 'light';

  return (
    <Box
      role="tablist"
      aria-label="Filter students by category"
      sx={{
        display: 'flex',
        gap: 0.75,
        overflowX: 'auto',
        pb: 0.5,
        // The bar may scroll itself; it must never push the document sideways.
        maxWidth: '100%',
        '&::-webkit-scrollbar': { display: 'none' },
        scrollbarWidth: 'none',
      }}
    >
      {SEGMENT_ORDER.map((segment) => {
        const active = value === segment;
        const color = segmentColor(segment, mode);
        const count = counts?.[segment] ?? 0;

        return (
          <Tooltip key={segment} title={SEGMENT_TOOLTIP[segment]} arrow enterTouchDelay={400}>
            <Chip
              role="tab"
              aria-selected={active}
              // Explicit, and it must LEAD with the visible label. Without it
              // MUI's Tooltip contributes its title as the accessible name, so
              // the pill announced as "Break Year and Class 12: the students
              // sitting the exam this year" while reading "Exam this year" on
              // screen. That is a WCAG 2.5.3 Label in Name failure, and it also
              // breaks voice control ("click Exam this year" matches nothing).
              aria-label={`${SEGMENT_LABEL[segment]}, ${count} students. ${SEGMENT_TOOLTIP[segment]}`}
              onClick={() => onChange(segment)}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                  <span>{SEGMENT_LABEL[segment]}</span>
                  <Typography
                    component="span"
                    sx={{
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      px: 0.6,
                      borderRadius: 1,
                      bgcolor: active ? alpha('#FFFFFF', 0.28) : alpha(color, 0.16),
                      color: active ? 'inherit' : color,
                    }}
                  >
                    {count}
                  </Typography>
                </Box>
              }
              sx={{
                // 44px keeps the whole bar inside the Material touch guideline.
                minHeight: 44,
                borderRadius: 2,
                flexShrink: 0,
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
                border: `1px solid ${alpha(color, active ? 0 : 0.35)}`,
                bgcolor: active ? color : 'transparent',
                color: active ? theme.palette.getContrastText(color) : 'text.primary',
                '&:hover': { bgcolor: active ? color : alpha(color, 0.1) },
              }}
            />
          </Tooltip>
        );
      })}
    </Box>
  );
}
