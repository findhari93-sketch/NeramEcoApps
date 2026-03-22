'use client';

import { Box, Typography, useTheme } from '@neram/ui';

interface WatchTimeChartProps {
  data: { label: string; value: number }[];
  maxValue?: number;
}

export default function WatchTimeChart({ data, maxValue }: WatchTimeChartProps) {
  const theme = useTheme();
  const max = maxValue || Math.max(...data.map((d) => d.value), 1);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {data.map((item, idx) => (
        <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography
            variant="caption"
            sx={{
              width: 48,
              textAlign: 'right',
              flexShrink: 0,
              color: 'text.secondary',
              fontSize: '0.7rem',
              fontWeight: 500,
            }}
          >
            {item.label}
          </Typography>
          <Box sx={{ flex: 1, position: 'relative', height: 20 }}>
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: '100%',
                width: '100%',
                bgcolor: theme.palette.grey[100],
                borderRadius: 1,
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: '100%',
                width: `${Math.max((item.value / max) * 100, item.value > 0 ? 3 : 0)}%`,
                bgcolor: theme.palette.primary.main,
                borderRadius: 1,
                transition: 'width 400ms ease',
              }}
            />
          </Box>
          <Typography
            variant="caption"
            sx={{
              width: 40,
              textAlign: 'right',
              flexShrink: 0,
              fontWeight: 600,
              fontSize: '0.7rem',
            }}
          >
            {formatMinutes(item.value)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function formatMinutes(seconds: number): string {
  if (seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
