'use client';

import { Box } from '@neram/ui';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import StatCard from '@/components/StatCard';
import type { ExamScheduleStats } from '@/types/exam-schedule';

interface SummaryStatsBarProps {
  stats: ExamScheduleStats;
}

export default function SummaryStatsBar({ stats }: SummaryStatsBarProps) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: { xs: 1, sm: 1.5 },
      }}
    >
      <StatCard
        title="Students"
        value={stats.total_students}
        icon={<PeopleOutlinedIcon />}
        size="compact"
        variant="surface"
      />
      <StatCard
        title="Submitted"
        value={`${stats.submitted_count}/${stats.total_students}`}
        icon={<CheckCircleOutlinedIcon />}
        size="compact"
        variant="surface"
        color="#43AA8B"
      />
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
