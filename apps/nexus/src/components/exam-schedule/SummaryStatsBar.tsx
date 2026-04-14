'use client';

import { Box, Typography, alpha, useTheme } from '@neram/ui';
import { ButtonBase } from '@mui/material';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import StatCard from '@/components/StatCard';
import type { ExamScheduleStats } from '@/types/exam-schedule';

interface SummaryStatsBarProps {
  stats: ExamScheduleStats;
  isTeacher?: boolean;
  onStudentsClick?: () => void;
  onSubmittedClick?: () => void;
}

export default function SummaryStatsBar({ stats, isTeacher, onStudentsClick, onSubmittedClick }: SummaryStatsBarProps) {
  const theme = useTheme();

  const cardSx = (clickable: boolean) => clickable ? {
    borderRadius: 2,
    cursor: 'pointer',
    display: 'block',
    width: '100%',
    textAlign: 'left' as const,
    transition: 'transform 0.12s ease, box-shadow 0.12s ease',
    '&:hover': {
      transform: 'translateY(-1px)',
      boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.12)}`,
    },
    '&:active': {
      transform: 'translateY(0)',
    },
  } : {};

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: { xs: 1, sm: 1.5 },
      }}
    >
      {onStudentsClick ? (
        <ButtonBase sx={cardSx(true)} onClick={onStudentsClick}>
          <StatCard
            title="Students"
            value={stats.total_students}
            icon={<PeopleOutlinedIcon />}
            size="compact"
            variant="surface"
          />
        </ButtonBase>
      ) : (
        <StatCard
          title="Students"
          value={stats.total_students}
          icon={<PeopleOutlinedIcon />}
          size="compact"
          variant="surface"
        />
      )}

      {onSubmittedClick ? (
        <ButtonBase sx={cardSx(true)} onClick={onSubmittedClick}>
          <StatCard
            title="Submitted"
            value={`${stats.submitted_count}/${stats.total_students}`}
            icon={<CheckCircleOutlinedIcon />}
            size="compact"
            variant="surface"
            color="#43AA8B"
          />
        </ButtonBase>
      ) : (
        <StatCard
          title="Submitted"
          value={`${stats.submitted_count}/${stats.total_students}`}
          icon={<CheckCircleOutlinedIcon />}
          size="compact"
          variant="surface"
          color="#43AA8B"
        />
      )}

      <StatCard
        title="This Week"
        value={`${stats.this_week_exam_count} writing`}
        icon={<EventOutlinedIcon />}
        size="compact"
        variant="surface"
      />
    </Box>

    {/* Teacher bucket breakdown pills */}

    {isTeacher && stats.buckets && (
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.75 }}>
        {stats.buckets.applied_no_date > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, px: 1, py: 0.3, borderRadius: 10, bgcolor: alpha(theme.palette.primary.main, 0.08) }}>
            <Typography variant="caption" fontWeight={700} color="primary.main" sx={{ fontSize: '0.65rem' }}>
              {stats.buckets.applied_no_date}
            </Typography>
            <Typography variant="caption" color="primary.main" sx={{ fontSize: '0.65rem' }}>applied</Typography>
          </Box>
        )}
        {stats.buckets.planning > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, px: 1, py: 0.3, borderRadius: 10, bgcolor: alpha(theme.palette.info.main, 0.08) }}>
            <Typography variant="caption" fontWeight={700} color="info.main" sx={{ fontSize: '0.65rem' }}>
              {stats.buckets.planning}
            </Typography>
            <Typography variant="caption" color="info.main" sx={{ fontSize: '0.65rem' }}>planning</Typography>
          </Box>
        )}
        {stats.buckets.not_this_year > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, px: 1, py: 0.3, borderRadius: 10, bgcolor: alpha(theme.palette.text.primary, 0.06) }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              {stats.buckets.not_this_year}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>next year</Typography>
          </Box>
        )}
        {stats.buckets.no_response > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, px: 1, py: 0.3, borderRadius: 10, bgcolor: alpha(theme.palette.warning.main, 0.08) }}>
            <Typography variant="caption" fontWeight={700} color="warning.main" sx={{ fontSize: '0.65rem' }}>
              {stats.buckets.no_response}
            </Typography>
            <Typography variant="caption" color="warning.main" sx={{ fontSize: '0.65rem' }}>no response</Typography>
          </Box>
        )}
      </Box>
    )}
    </Box>
  );
}
