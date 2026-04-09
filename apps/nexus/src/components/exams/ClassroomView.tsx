'use client';

import { useState, useMemo } from 'react';
import { Box } from '@neram/ui';
import type { ExamScheduleData, DateRailItem } from '@/types/exam-schedule';
import SummaryStatsBar from '@/components/exam-schedule/SummaryStatsBar';
import NotSubmittedNudge from '@/components/exam-schedule/NotSubmittedNudge';
import WeekNavigator from '@/components/exam-schedule/WeekNavigator';
import RecentlyCompletedStrip from '@/components/exam-schedule/RecentlyCompletedStrip';
import DateRail from '@/components/exam-schedule/DateRail';
import StudentsPopup from '@/components/exam-schedule/StudentsPopup';
import ExamStatusCard from '@/components/exams/ExamStatusCard';

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

function formatISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function generatePhaseDates(startDate: string, endDate: string): string[] {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const dates: string[] = [];
  const d = new Date(start);
  while (d <= end) {
    if (d.getDay() === 5 || d.getDay() === 6) {
      dates.push(formatISO(d));
    }
    d.setDate(d.getDate() + 1);
  }
  return dates;
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
  const [studentsOpen, setStudentsOpen] = useState(false);
  const [submittedOpen, setSubmittedOpen] = useState(false);

  // Build date rail items from phase dates
  const today = formatISO(new Date());
  const railItems = useMemo<DateRailItem[]>(() => {
    const phaseDates = generatePhaseDates(
      schedule.phase_info.start_date,
      schedule.phase_info.end_date
    );
    // Build a map of date -> student count from all weeks
    // We use stats.students to count per date
    const dateCountMap: Record<string, number> = {};
    for (const s of schedule.stats.students) {
      if (s.exam_date) {
        dateCountMap[s.exam_date] = (dateCountMap[s.exam_date] || 0) + 1;
      }
    }
    return phaseDates.map(date => {
      const d = new Date(date + 'T00:00:00');
      return {
        date,
        day: d.getDay() === 5 ? 'Fri' : 'Sat',
        studentCount: dateCountMap[date] || 0,
        isPast: date < today,
      };
    });
  }, [schedule.phase_info.start_date, schedule.phase_info.end_date, schedule.stats.students, today]);

  // Determine active friday for date rail highlighting
  const activeFriday = (schedule.current_week.friday ?? schedule.current_week.saturday)?.date ?? null;

  // Handle date rail selection: calculate week offset for clicked date
  const handleRailSelect = (date: string) => {
    // Find which week this date belongs to, compute offset from current week
    const { navigation } = schedule;
    const clickedDate = new Date(date + 'T00:00:00');
    const activeDateStr = activeFriday || today;
    const activeDate = new Date(activeDateStr + 'T00:00:00');
    const diffDays = Math.round((clickedDate.getTime() - activeDate.getTime()) / (1000 * 60 * 60 * 24));
    const weekDiff = Math.round(diffDays / 7);
    const newOffset = Math.max(navigation.min_week_offset, Math.min(navigation.max_week_offset, weekOffset + weekDiff));
    if (newOffset !== weekOffset) onWeekChange(newOffset);
  };

  // Find current user's summary for the student status card
  const myStudentSummary = !isTeacher
    ? schedule.stats.students.find(s => s.student_id === currentUserId)
    : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {!isTeacher && (
        <ExamStatusCard
          planState={myStudentSummary?.plan_state ?? null}
          targetYear={myStudentSummary?.target_year ?? null}
          applicationNumber={myStudentSummary?.application_number ?? null}
          examDate={myStudentSummary?.exam_date ?? null}
          examCity={myStudentSummary?.exam_city ?? null}
          onUpdateStatus={onAddMyDate}
        />
      )}
      <SummaryStatsBar
        stats={schedule.stats}
        isTeacher={isTeacher}
        onStudentsClick={() => setStudentsOpen(true)}
        onSubmittedClick={() => setSubmittedOpen(true)}
      />

      {/* Date rail for fast navigation */}
      <DateRail
        items={railItems}
        activeFriday={activeFriday}
        onSelect={handleRailSelect}
      />

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

      {/* Students popup */}
      <StudentsPopup
        open={studentsOpen}
        onClose={() => setStudentsOpen(false)}
        mode="all"
        students={schedule.stats.students}
        totalStudents={schedule.stats.total_students}
        isTeacher={isTeacher}
        buckets={schedule.stats.buckets}
      />

      {/* Submitted popup */}
      <StudentsPopup
        open={submittedOpen}
        onClose={() => setSubmittedOpen(false)}
        mode="submitted"
        students={schedule.stats.students}
        submittedStudents={schedule.stats.submitted_students}
        totalStudents={schedule.stats.total_students}
        isTeacher={isTeacher}
        buckets={schedule.stats.buckets}
      />
    </Box>
  );
}
