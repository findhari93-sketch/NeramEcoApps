'use client';

import { Box, Paper, Typography, Skeleton, alpha, useTheme } from '@neram/ui';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PercentIcon from '@mui/icons-material/Percent';
import type { QBProgressStats } from '@neram/database';

interface StatsRowProps {
  stats: QBProgressStats | null;
  loading: boolean;
  /** Compact mode renders stats as a single inline text row */
  compact?: boolean;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}

function StatCard({ icon, label, value, color }: StatCardProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        flex: 1,
        minWidth: 0,
        p: 1.5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.5,
        borderColor: alpha(color, 0.3),
      }}
    >
      <Box sx={{ color, display: 'flex' }}>{icon}</Box>
      <Typography variant="h6" fontWeight={700} sx={{ color }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" noWrap>
        {label}
      </Typography>
    </Paper>
  );
}

export default function StatsRow({ stats, loading, compact = false }: StatsRowProps) {
  const theme = useTheme();

  if (loading) {
    if (compact) {
      return <Skeleton variant="text" width={220} height={20} />;
    }
    return (
      <Box sx={{ display: 'flex', gap: 1 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" height={100} sx={{ flex: 1 }} />
        ))}
      </Box>
    );
  }

  if (!stats) return null;

  if (compact) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
        <Box component="span" sx={{ fontWeight: 600, color: theme.palette.primary.main }}>{stats.total_questions}</Box> questions
        <Box component="span" sx={{ mx: 0.5, color: 'text.disabled' }}>·</Box>
        <Box component="span" sx={{ fontWeight: 600, color: theme.palette.success.main }}>{stats.attempted_count}</Box> attempted
        <Box component="span" sx={{ mx: 0.5, color: 'text.disabled' }}>·</Box>
        <Box component="span" sx={{ fontWeight: 600, color: theme.palette.info.main }}>{stats.accuracy_percentage}%</Box> accuracy
      </Typography>
    );
  }

  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
      <StatCard
        icon={<QuizOutlinedIcon fontSize="small" />}
        label="Total"
        value={stats.total_questions}
        color={theme.palette.primary.main}
      />
      <StatCard
        icon={<CheckCircleOutlineIcon fontSize="small" />}
        label="Attempted"
        value={stats.attempted_count}
        color={theme.palette.success.main}
      />
      <StatCard
        icon={<PercentIcon fontSize="small" />}
        label="Accuracy"
        value={`${stats.accuracy_percentage}%`}
        color={theme.palette.info.main}
      />
    </Box>
  );
}
