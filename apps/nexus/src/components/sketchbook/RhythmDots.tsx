'use client';

import { Box, useTheme } from '@neram/ui';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface RhythmDotsProps {
  days: boolean[];
  /** 0..6, outlines today. Omit for a past week. */
  todayIndex?: number;
  size?: number;
}

/** Seven dots, Monday first. Read-only: a 48px row that is never a tap target. */
export default function RhythmDots({ days, todayIndex, size = 20 }: RhythmDotsProps) {
  const theme = useTheme();
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', minHeight: size >= 20 ? 48 : undefined }}>
      {days.map((on, i) => (
        <Box key={i} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
          <Box
            role="img"
            aria-label={`${DAY_NAMES[i]}, ${on ? 'practised' : 'no sketch'}`}
            sx={{
              width: size,
              height: size,
              borderRadius: '50%',
              bgcolor: on ? theme.palette.primary.main : theme.palette.action.disabledBackground,
              border: i === todayIndex ? `2px solid ${theme.palette.primary.dark}` : '2px solid transparent',
              boxSizing: 'border-box',
            }}
          />
          {size >= 16 && (
            <Box component="span" aria-hidden sx={{ fontSize: 11, color: theme.palette.text.secondary }}>
              {DAY_LETTERS[i]}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
