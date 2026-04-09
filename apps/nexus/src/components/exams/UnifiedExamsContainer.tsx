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
  Divider,
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
    router.push(`/student/documents`);
  };

  const handleDeleteDate = async (attemptId: string, reason: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/documents/exam-attempts/${attemptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'delete', deletion_reason: reason }),
      });
      if (!res.ok) throw new Error('Failed');
      setSnackbar({ open: true, message: 'Exam date removed', severity: 'success' });
      fetchData();
    } catch {
      setSnackbar({ open: true, message: 'Failed to remove date', severity: 'error' });
    }
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

  const journeyView = data ? (
    <MyJourneyView
      attempts={data.my_attempts}
      onPickDate={() => setDialogOpen(true)}
      onMarkCompleted={handleMarkCompleted}
      onEnterScores={handleEnterScores}
      onDeleteDate={handleDeleteDate}
    />
  ) : null;

  const classroomView = data?.schedule ? (
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
  ) : null;

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
          {/* Desktop: professional side-by-side layout */}
          {isDesktop ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 3, alignItems: 'start' }}>
              {/* Left: My Journey */}
              {!isTeacher && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <PersonalHeroCard
                    nextExam={data.next_exam}
                    progress={data.overall_progress}
                    attempts={data.my_attempts}
                    onPickDate={() => setDialogOpen(true)}
                    onSwitchToSchedule={() => {}}
                  />
                  <Paper
                    variant="outlined"
                    sx={{ borderRadius: 3, p: 2.5, bgcolor: 'background.paper' }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <Typography
                        variant="caption"
                        fontWeight={700}
                        sx={{
                          textTransform: 'uppercase',
                          letterSpacing: 0.8,
                          color: 'text.secondary',
                          fontSize: '0.68rem',
                        }}
                      >
                        My Journey
                      </Typography>
                      <Divider sx={{ flex: 1 }} />
                    </Box>
                    {journeyView}
                  </Paper>
                </Box>
              )}

              {/* Right: Classroom — students only; teachers use the full-width box below */}
              {!isTeacher && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <Paper
                    variant="outlined"
                    sx={{ borderRadius: 3, p: 2.5, bgcolor: 'background.paper' }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <Typography
                        variant="caption"
                        fontWeight={700}
                        sx={{
                          textTransform: 'uppercase',
                          letterSpacing: 0.8,
                          color: 'text.secondary',
                          fontSize: '0.68rem',
                        }}
                      >
                        Classroom
                      </Typography>
                      <Divider sx={{ flex: 1 }} />
                    </Box>
                    {classroomView}
                  </Paper>
                </Box>
              )}

              {/* Full-width classroom for teacher (no journey panel) */}
              {isTeacher && (
                <Box sx={{ gridColumn: '1 / -1' }}>
                  <Paper
                    variant="outlined"
                    sx={{ borderRadius: 3, p: 2.5, bgcolor: 'background.paper' }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <Typography
                        variant="caption"
                        fontWeight={700}
                        sx={{
                          textTransform: 'uppercase',
                          letterSpacing: 0.8,
                          color: 'text.secondary',
                          fontSize: '0.68rem',
                        }}
                      >
                        Classroom Schedule
                      </Typography>
                      <Divider sx={{ flex: 1 }} />
                    </Box>
                    {classroomView}
                  </Paper>
                </Box>
              )}
            </Box>
          ) : (
            /* Mobile/tablet: stacked with segmented control */
            <>
              {!isTeacher && (
                <PersonalHeroCard
                  nextExam={data.next_exam}
                  progress={data.overall_progress}
                  attempts={data.my_attempts}
                  onPickDate={() => setDialogOpen(true)}
                  onSwitchToSchedule={() => handleTabChange('schedule')}
                />
              )}

              {!isTeacher && (
                <ViewSegmentControl value={activeTab} onChange={handleTabChange} />
              )}

              {(activeTab === 'journey' && !isTeacher) ? (
                journeyView
              ) : classroomView}
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
          myPlan={(() => {
            const me = data.schedule.stats.students.find(s => s.student_id === user?.id);
            return me ? { plan_state: me.plan_state, target_year: me.target_year, application_number: me.application_number } : null;
          })()}
        />
      )}

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
