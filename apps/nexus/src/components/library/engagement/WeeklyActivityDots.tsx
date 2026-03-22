'use client';

import { Box, Typography, Tooltip, useTheme } from '@neram/ui';

interface WeeklyActivityDotsProps {
  data: { date: string; watched: boolean; watch_seconds: number }[];
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function formatWatchTime(seconds: number): string {
  if (seconds <= 0) return 'No activity';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function WeeklyActivityDots({ data }: WeeklyActivityDotsProps) {
  const theme = useTheme();

  // Ensure we have exactly 7 entries (Mon-Sun)
  const days = data.length >= 7 ? data.slice(-7) : data;

  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, px: 1 }}>
      {days.map((day, idx) => {
        const dayLabel = DAY_LABELS[idx] || '';
        const dateObj = new Date(day.date + 'T00:00:00');
        const tooltipText = `${dateObj.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}: ${formatWatchTime(day.watch_seconds)}`;

        return (
          <Tooltip key={day.date} title={tooltipText} arrow>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  bgcolor: day.watched
                    ? theme.palette.primary.main
                    : theme.palette.grey[200],
                  border: day.watched
                    ? `2px solid ${theme.palette.primary.main}`
                    : `2px solid ${theme.palette.grey[300]}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 200ms ease',
                }}
              >
                {day.watched && (
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: '#fff',
                    }}
                  />
                )}
              </Box>
              <Typography
                variant="caption"
                sx={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  color: day.watched ? 'primary.main' : 'text.disabled',
                }}
              >
                {dayLabel}
              </Typography>
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}
