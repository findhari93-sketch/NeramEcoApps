'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  Fab,
  Snackbar,
  Alert,
} from '@neram/ui';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import DateRangeOutlinedIcon from '@mui/icons-material/DateRangeOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { ExamScheduleData } from '@/types/exam-schedule';
import PhaseSelector from './PhaseSelector';
import SummaryStatsBar from './SummaryStatsBar';
import NotSubmittedNudge from './NotSubmittedNudge';
import WeekNavigator from './WeekNavigator';
import RecentlyCompletedStrip from './RecentlyCompletedStrip';
import AddExamDateSheet from './AddExamDateSheet';

export default function ExamScheduleDashboard() {
  const { user, activeClassroom, getToken, nexusRole } = useNexusAuthContext();
  const isTeacher = nexusRole === 'teacher' || nexusRole === 'admin';

  const [data, setData] = useState<ExamScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState('phase_1');
  const [weekOffset, setWeekOffset] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });

  const fetchData = useCallback(async () => {
    if (!activeClassroom) return;
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({
        classroom: activeClassroom.id,
        exam_type: 'nata',
        year: String(new Date().getFullYear()),
        phase,
        week_offset: String(weekOffset),
      });

      const res = await fetch(`/api/exam-schedule?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to load');
      setData(await res.json());
    } catch {
      setSnackbar({ open: true, message: 'Failed to load exam schedule', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, getToken, phase, weekOffset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handlePhaseChange = (newPhase: string) => {
    setPhase(newPhase);
    setWeekOffset(0);
  };

  const handleRemind = async (studentIds: string[]) => {
    if (!activeClassroom) return;
    setReminding(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/exam-schedule/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ student_ids: studentIds, classroom_id: activeClassroom.id }),
      });
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setSnackbar({ open: true, message: `Reminder sent to ${json.reminded_count} student${json.reminded_count !== 1 ? 's' : ''}`, severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Failed to send reminders', severity: 'error' });
    } finally {
      setReminding(false);
    }
  };

  const handleDateSubmitted = () => {
    setSnackbar({ open: true, message: 'Exam date submitted!', severity: 'success' });
    fetchData();
  };

  if (!activeClassroom) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">Select a classroom to view exam schedule.</Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pb: { xs: 8, md: 0 } }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
          <DateRangeOutlinedIcon sx={{ color: 'primary.main' }} />
          <Typography variant="h6" fontWeight={700} noWrap>NATA Exam Schedule</Typography>
        </Box>
        <PhaseSelector phase={phase} onChange={handlePhaseChange} />
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
            <Skeleton variant="rounded" height={60} />
            <Skeleton variant="rounded" height={60} />
            <Skeleton variant="rounded" height={60} />
          </Box>
          <Skeleton variant="rounded" height={40} />
          <Skeleton variant="rounded" height={300} />
        </Box>
      ) : data ? (
        <>
          {/* Stats */}
          <SummaryStatsBar stats={data.stats} />

          {/* Not submitted nudge */}
          <NotSubmittedNudge
            students={data.not_submitted}
            isTeacher={isTeacher}
            currentUserId={user?.id || ''}
            onAddMyDate={() => setDialogOpen(true)}
            onRemind={handleRemind}
            reminding={reminding}
          />

          {/* Week navigator (main content) */}
          <WeekNavigator
            week={data.current_week}
            navigation={data.navigation}
            weekOffset={weekOffset}
            onWeekChange={setWeekOffset}
            totalWeeks={data.phase_info.total_weeks}
            currentUserId={user?.id || ''}
          />

          {/* Recently completed strip */}
          <RecentlyCompletedStrip
            students={data.recently_completed}
            isTeacher={isTeacher}
          />
        </>
      ) : null}

      {/* Student FAB */}
      {!isTeacher && (
        <Fab
          color="primary"
          variant="extended"
          onClick={() => setDialogOpen(true)}
          sx={{
            position: 'fixed',
            bottom: { xs: 80, md: 24 },
            right: { xs: 16, md: 24 },
            textTransform: 'none',
            fontWeight: 700,
            zIndex: 1000,
          }}
        >
          <AddOutlinedIcon sx={{ mr: 0.5 }} />
          Add My Date
        </Fab>
      )}

      {/* Add exam date sheet */}
      {data && (
        <AddExamDateSheet
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          phaseInfo={data.phase_info}
          myAttempts={data.my_attempts}
          classroomId={activeClassroom.id}
          getToken={getToken}
          onSubmitted={handleDateSubmitted}
        />
      )}

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
