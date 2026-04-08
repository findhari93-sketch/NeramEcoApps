'use client';

import { Box, alpha, useTheme } from '@neram/ui';
import ButtonBase from '@mui/material/ButtonBase';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import StatCard from '@/components/StatCard';
import type { ExamScheduleStats } from '@/types/exam-schedule';

interface SummaryStatsBarProps {
  stats: ExamScheduleStats;
  onStudentsClick?: () => void;
  onSubmittedClick?: () => void;
}

export default function SummaryStatsBar({ stats, onStudentsClick, onSubmittedClick }: SummaryStatsBarProps) {
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
  );
}
