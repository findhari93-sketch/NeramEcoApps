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
  useTheme,
  useMediaQuery,
} from '@neram/ui';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import { useSearchParams, useRouter } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { UnifiedExamsResponse } from '@/types/unified-exams';
import PhaseSelector from '@/components/exam-schedule/PhaseSelector';
import AddExamDateSheet from '@/components/exam-schedule/AddExamDateSheet';
import PersonalHeroCard from './PersonalHeroCard';
import ViewSegmentControl from './ViewSegmentControl';
import MyJourneyView from './MyJourneyView';
import ClassroomView from './ClassroomView';

export default function UnifiedExamsContainer() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, activeClassroom, getToken, nexusRole } = useNexusAuthContext();
  const isTeacher = nexusRole === 'teacher' || nexusRole === 'admin';

  const [data, setData] = useState<UnifiedExamsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState('phase_1');
  const [weekOffset, setWeekOffset] = useState(0);
  const [activeTab, setActiveTab] = useState<'journey' | 'schedule'>(
    (searchParams.get('tab') as 'journey' | 'schedule') || (isTeacher ? 'schedule' : 'journey')
  );
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

      const res = await fetch(`/api/exams/unified?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to load');
      setData(await res.json());
    } catch {
      setSnackbar({ open: true, message: 'Failed to load exam data', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, getToken, phase, weekOffset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleTabChange = (tab: 'journey' | 'schedule') => {
    setActiveTab(tab);
    router.replace(`?tab=${tab}`, { scroll: false });
  };

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

  const handleMarkCompleted = async (attemptId: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/documents/exam-attempts/${attemptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ state: 'completed', exam_completed_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error('Failed');
      setSnackbar({ open: true, message: 'Marked as completed', severity: 'success' });
      fetchData();
    } catch {
      setSnackbar({ open: true, message: 'Failed to update', severity: 'error' });
    }
  };

  const handleEnterScores = (attemptId: string) => {
    // For now, navigate to the documents page where ScorecardEntrySheet exists
    // TODO: integrate ScorecardEntrySheet directly
    router.push(`/student/documents`);
  };

  const handleDateSubmitted = () => {
    setSnackbar({ open: true, message: 'Exam date submitted!', severity: 'success' });
    fetchData();
  };

  if (!activeClassroom) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">Select a classroom to view exams.</Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pb: { xs: 8, md: 0 } }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
          <EventNoteOutlinedIcon sx={{ color: 'primary.main' }} />
          <Typography variant="h6" fontWeight={700} noWrap>NATA Exams</Typography>
        </Box>
        <PhaseSelector phase={phase} onChange={handlePhaseChange} />
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Skeleton variant="rounded" height={70} />
          <Skeleton variant="rounded" height={48} />
          <Skeleton variant="rounded" height={200} />
        </Box>
      ) : data ? (
        <>
          {/* Personal hero card (students only) */}
          {!isTeacher && (
            <PersonalHeroCard
              nextExam={data.next_exam}
              progress={data.overall_progress}
              attempts={data.my_attempts}
              onPickDate={() => setDialogOpen(true)}
              onSwitchToSchedule={() => handleTabChange('schedule')}
            />
          )}

          {/* Desktop: side-by-side, Mobile: segmented control */}
          {isDesktop && !isTeacher ? (
            // Desktop split view
            <Box sx={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 3, alignItems: 'start' }}>
              <Box>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', fontSize: '0.7rem' }}>
                  My Journey
                </Typography>
                <MyJourneyView
                  attempts={data.my_attempts}
                  onPickDate={() => setDialogOpen(true)}
                  onMarkCompleted={handleMarkCompleted}
                  onEnterScores={handleEnterScores}
                />
              </Box>
              <Box>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', fontSize: '0.7rem' }}>
                  Classroom
                </Typography>
                {data.schedule && (
                  <ClassroomView
                    schedule={data.schedule}
                    weekOffset={weekOffset}
                    onWeekChange={setWeekOffset}
                    currentUserId={user?.id || ''}
                    isTeacher={false}
                    onAddMyDate={() => setDialogOpen(true)}
                    onRemind={handleRemind}
                    reminding={reminding}
                  />
                )}
              </Box>
            </Box>
          ) : (
            // Mobile/tablet: segmented control
            <>
              {!isTeacher && (
                <ViewSegmentControl value={activeTab} onChange={handleTabChange} />
              )}

              {(activeTab === 'journey' && !isTeacher) ? (
                <MyJourneyView
                  attempts={data.my_attempts}
                  onPickDate={() => setDialogOpen(true)}
                  onMarkCompleted={handleMarkCompleted}
                  onEnterScores={handleEnterScores}
                />
              ) : data.schedule ? (
                <ClassroomView
                  schedule={data.schedule}
                  weekOffset={weekOffset}
                  onWeekChange={setWeekOffset}
                  currentUserId={user?.id || ''}
                  isTeacher={isTeacher}
                  onAddMyDate={() => setDialogOpen(true)}
                  onRemind={handleRemind}
                  reminding={reminding}
                />
              ) : null}
            </>
          )}
        </>
      ) : null}

      {/* Student FAB */}
      {!isTeacher && (activeTab === 'schedule' || isDesktop) && (
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
      {data?.schedule && (
        <AddExamDateSheet
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          phaseInfo={data.schedule.phase_info}
          myAttempts={data.schedule.my_attempts}
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
