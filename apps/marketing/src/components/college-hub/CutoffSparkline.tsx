'use client';

import { Box, Typography, Chip, Stack } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { CollegeCutoff } from '@/lib/college-hub/types';

interface CutoffSparklineProps {
  cutoffs: CollegeCutoff[];
  counselingSystem?: string;
  category?: string;
}

export default function CutoffSparkline({
  cutoffs,
  counselingSystem = 'TNEA',
  category = 'general',
}: CutoffSparklineProps) {
  if (cutoffs.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography color="text.secondary" variant="body2">
          Cutoff data not yet available.
        </Typography>
      </Box>
    );
  }

  // Filter and sort by year
  const filtered = cutoffs
    .filter((c) => c.counseling_system === counselingSystem && c.category === category)
    .sort((a, b) => a.academic_year.localeCompare(b.academic_year));

  if (filtered.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography color="text.secondary" variant="body2">
          No {counselingSystem} {category.toUpperCase()} cutoff data.
        </Typography>
      </Box>
    );
  }

  const chartData = filtered.map((c) => ({
    year: c.academic_year,
    cutoff: c.cutoff_value,
    seats: c.total_seats,
  }));

  const latest = filtered[filtered.length - 1];
  const previous = filtered[filtered.length - 2];
  const trend = previous && latest.cutoff_value !== null && previous.cutoff_value !== null
    ? latest.cutoff_value - previous.cutoff_value
    : null;

  const isRankBased = latest.cutoff_type === 'rank';
  const trendGood = isRankBased ? (trend !== null && trend < 0) : (trend !== null && trend > 0);

  return (
    <Box>
      {/* Summary */}
      <Stack direction="row" gap={2} alignItems="center" sx={{ mb: 2, flexWrap: 'wrap' }}>
        {latest.cutoff_value !== null && (
          <Box>
            <Typography variant="caption" color="text.secondary">
              {new Date().getFullYear() - 1} Cutoff ({category.toUpperCase()})
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1 }}>
              {isRankBased
                ? `#${Math.round(latest.cutoff_value).toLocaleString()}`
                : `${latest.cutoff_value}%`}
            </Typography>
          </Box>
        )}

        {trend !== null && (
          <Chip
            label={`${trendGood ? '' : '+'}${isRankBased ? Math.round(trend) : trend.toFixed(1)} vs prev year`}
            size="small"
            sx={{
              bgcolor: trendGood ? '#dcfce7' : '#fef2f2',
              color: trendGood ? '#166534' : '#991b1b',
              fontWeight: 600,
            }}
          />
        )}

        {latest.total_seats !== null && (
          <Typography variant="caption" color="text.secondary">
            {latest.total_seats} seats
          </Typography>
        )}
      </Stack>

      {/* Chart */}
      {chartData.length >= 2 && (
        <Box sx={{ width: '100%', height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <XAxis
                dataKey="year"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                reversed={isRankBased}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => isRankBased ? `#${v.toLocaleString()}` : `${v}%`}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                formatter={((value: number) =>
                  isRankBased
                    ? `Rank #${Math.round(value).toLocaleString()}`
                    : `${value}%`) as any}
              />
              <Line
                type="monotone"
                dataKey="cutoff"
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={{ fill: '#2563eb', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}

      {chartData.length === 1 && (
        <Typography variant="caption" color="text.secondary">
          Only one year of data available. Trend chart will appear as more data is collected.
        </Typography>
      )}
    </Box>
  );
}
