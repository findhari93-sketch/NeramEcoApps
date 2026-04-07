'use client';

import { Box } from '@neram/ui';
import type { ExamScheduleData } from '@/types/exam-schedule';
import SummaryStatsBar from '@/components/exam-schedule/SummaryStatsBar';
import NotSubmittedNudge from '@/components/exam-schedule/NotSubmittedNudge';
import WeekNavigator from '@/components/exam-schedule/WeekNavigator';
import RecentlyCompletedStrip from '@/components/exam-schedule/RecentlyCompletedStrip';

interface ClassroomViewProps {
  schedule: ExamScheduleData;
  weekOffset: number;
  onWeekChange: (offset: number) => void;
  currentUserId: string;
  isTeacher: boolean;
  onAddMyDate: () => void;
  onRemind: (ids: string[]) => void;
  reminding: boolean;
}

export default function ClassroomView({
  schedule,
  weekOffset,
  onWeekChange,
  currentUserId,
  isTeacher,
  onAddMyDate,
  onRemind,
  reminding,
}: ClassroomViewProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SummaryStatsBar stats={schedule.stats} />

      <NotSubmittedNudge
        students={schedule.not_submitted}
        isTeacher={isTeacher}
        currentUserId={currentUserId}
        onAddMyDate={onAddMyDate}
        onRemind={onRemind}
        reminding={reminding}
      />

      <WeekNavigator
        week={schedule.current_week}
        navigation={schedule.navigation}
        weekOffset={weekOffset}
        onWeekChange={onWeekChange}
        totalWeeks={schedule.phase_info.total_weeks}
        currentUserId={currentUserId}
      />

      <RecentlyCompletedStrip
        students={schedule.recently_completed}
        isTeacher={isTeacher}
      />
    </Box>
  );
}
