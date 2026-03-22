'use client';

import { Box, Typography, useTheme } from '@mui/material';
import type { DeviceDistributionStats } from '@neram/database';

interface DeviceDistributionChartProps {
  stats: DeviceDistributionStats;
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
export function DeviceDistributionChart({ stats }: DeviceDistributionChartProps) {
  const theme = useTheme();
  const total = stats.total_students || 1;

  const segments: Segment[] = [
    { label: 'Both devices', value: stats.both_devices, color: theme.palette.success.main },
    { label: 'Desktop only', value: stats.desktop_only, color: theme.palette.primary.main },
    { label: 'Mobile only', value: stats.mobile_only, color: theme.palette.warning.main },
    { label: 'No devices', value: stats.no_devices, color: theme.palette.grey[400] },
  ];

  // Calculate SVG donut chart
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {/* Donut chart */}
      <Box sx={{ position: 'relative', width: 200, height: 200, flexShrink: 0 }}>
        <svg viewBox="0 0 200 200" width={200} height={200}>
          {segments.map((seg) => {
            const pct = seg.value / total;
            const dashLength = pct * circumference;
            const offset = cumulativeOffset;
            cumulativeOffset += dashLength;

            if (seg.value === 0) return null;

            return (
              <circle
                key={seg.label}
                cx="100"
                cy="100"
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth="24"
                strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 100 100)"
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
          <Typography variant="h4" fontWeight={700}>
            {stats.total_students}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Total Students
          </Typography>
        </Box>
      </Box>

      {/* Legend */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {segments.map((seg) => (
          <Box key={seg.label} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                bgcolor: seg.color,
                flexShrink: 0,
              }}
            />
            <Box>
              <Typography variant="body2" fontWeight={600}>
                {seg.value} ({total > 0 ? Math.round((seg.value / total) * 100) : 0}%)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {seg.label}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
