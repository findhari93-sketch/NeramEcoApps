'use client';

import { Box, Typography, useTheme } from '@mui/material';
import type { DeviceDistributionStats } from '@neram/database';

interface DeviceDistributionChartProps {
  stats: DeviceDistributionStats;
  isMobile?: boolean;
}

interface Segment {
  label: string;
  value: number;
  color: string;
}

/**
 * Custom donut chart for device distribution.
 * No external chart library - pure CSS/SVG.
 */
export function DeviceDistributionChart({ stats, isMobile }: DeviceDistributionChartProps) {
  const theme = useTheme();
  const total = stats.total_students || 1;

  const segments: Segment[] = [
    { label: 'Both devices', value: stats.both_devices, color: theme.palette.success.main },
    { label: 'Desktop only', value: stats.desktop_only, color: theme.palette.primary.main },
    { label: 'Mobile only', value: stats.mobile_only, color: theme.palette.warning.main },
    { label: 'No devices', value: stats.no_devices, color: theme.palette.grey[400] },
  ];

  // Mobile: smaller donut
  const chartSize = isMobile ? 120 : 200;
  const radius = isMobile ? 48 : 80;
  const strokeWidth = isMobile ? 16 : 24;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: 'center',
        gap: isMobile ? 2 : 4,
        flexWrap: 'wrap',
      }}
    >
      {/* Donut chart */}
      <Box sx={{ position: 'relative', width: chartSize, height: chartSize, flexShrink: 0 }}>
        <svg viewBox={`0 0 ${chartSize} ${chartSize}`} width={chartSize} height={chartSize}>
          {segments.map((seg) => {
            const pct = seg.value / total;
            const dashLength = pct * circumference;
            const offset = cumulativeOffset;
            cumulativeOffset += dashLength;

            if (seg.value === 0) return null;

            return (
              <circle
                key={seg.label}
                cx={chartSize / 2}
                cy={chartSize / 2}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${chartSize / 2} ${chartSize / 2})`}
                strokeLinecap="round"
              />
            );
          })}
        </svg>
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
          }}
        >
          <Typography variant={isMobile ? 'h6' : 'h4'} fontWeight={700}>
            {stats.total_students}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: isMobile ? 9 : undefined }}>
            Total
          </Typography>
        </Box>
      </Box>

      {/* Legend */}
      <Box
        sx={
          isMobile
            ? {
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 1,
                width: '100%',
              }
            : {
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
              }
        }
      >
        {segments.map((seg) => (
          <Box key={seg.label} sx={{ display: 'flex', alignItems: 'center', gap: isMobile ? 0.75 : 1.5 }}>
            <Box
              sx={{
                width: isMobile ? 8 : 12,
                height: isMobile ? 8 : 12,
                borderRadius: '50%',
                bgcolor: seg.color,
                flexShrink: 0,
              }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} sx={{ fontSize: isMobile ? 12 : undefined, lineHeight: 1.2 }}>
                {seg.value} ({total > 0 ? Math.round((seg.value / total) * 100) : 0}%)
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: isMobile ? 10 : undefined }}>
                {seg.label}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
