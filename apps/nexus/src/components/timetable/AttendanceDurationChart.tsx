'use client';

import { Box, Typography, useTheme } from '@neram/ui';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface DurationDatum {
  name: string;
  minutes: number;
  /** 'ok' | 'late' | 'leftEarly' | 'dropped' */
  flag: 'ok' | 'late' | 'leftEarly' | 'dropped';
}

/**
 * Per-student attendance duration, one horizontal bar each. Colour encodes the
 * exception (joined late / left early / dropped mid-class) so a teacher scanning
 * on a phone spots the outliers without reading every row. Loaded via next/dynamic
 * (ssr:false) so recharts stays out of the initial bundle.
 */
export default function AttendanceDurationChart({ data }: { data: DurationDatum[] }) {
  const theme = useTheme();
  const color: Record<DurationDatum['flag'], string> = {
    ok: theme.palette.success.main,
    late: theme.palette.warning.main,
    leftEarly: theme.palette.warning.dark,
    dropped: theme.palette.error.main,
  };

  if (data.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
        No one has joined yet, or attendance has not been synced.
      </Typography>
    );
  }

  // Height scales with the roster so bars stay tappable/readable.
  const height = Math.max(140, data.length * 34 + 24);

  return (
    <Box sx={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={data} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <XAxis type="number" tick={{ fontSize: 11 }} unit="m" />
          <YAxis
            type="category"
            dataKey="name"
            width={96}
            tick={{ fontSize: 11 }}
            interval={0}
          />
          <Tooltip
            formatter={(v) => [`${Number(v ?? 0)} min`, 'Attended']}
            cursor={{ fill: theme.palette.action.hover }}
          />
          <Bar dataKey="minutes" radius={[0, 4, 4, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={color[d.flag]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
