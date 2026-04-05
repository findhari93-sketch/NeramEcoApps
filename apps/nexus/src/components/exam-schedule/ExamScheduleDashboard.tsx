'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  MenuItem,
  Skeleton,
  Fab,
  Snackbar,
  Alert,
  useTheme,
} from '@neram/ui';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { ExamScheduleData } from '@/types/exam-schedule';
import NotSubmittedBanner from './NotSubmittedBanner';
import ExamDateCard from './ExamDateCard';
import RecentlyCompletedSection from './RecentlyCompletedSection';
import AddExamDateDialog from './AddExamDateDialog';

const PHASES = [
  { value: '', label: 'All Phases' },
  { value: 'phase_1', label: 'Phase 1' },
  { value: 'phase_2', label: 'Phase 2' },
];

export default function ExamScheduleDashboard() {
  const theme = useTheme();
  const { user, activeClassroom, getToken, nexusRole } = useNexusAuthContext();
  const isTeacher = nexusRole === 'teacher' || nexusRole === 'admin';

  const [data, setData] = useState<ExamScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState('');
  const [year] = useState(new Date().getFullYear());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const fetchData = useCallback(async () => {
    if (!activeClassroom) return;
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({
        classroom: activeClassroom.id,
        exam_type: 'nata',
        year: String(year),
      });
      if (phase) params.set('phase', phase);

      const res = await fetch(`/api/exam-schedule?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setData(json);
    } catch {
      setSnackbar({ open: true, message: 'Failed to load exam schedule', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, getToken, phase, year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRemind = async (studentIds: string[]) => {
    if (!activeClassroom) return;
    setReminding(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/exam-schedule/remind', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          student_ids: studentIds,
          classroom_id: activeClassroom.id,
        }),
      });

      if (!res.ok) throw new Error('Failed to send reminders');
      const json = await res.json();
      setSnackbar({
        open: true,
        message: `Reminder sent to ${json.reminded_count} student${json.reminded_count !== 1 ? 's' : ''}`,
        severity: 'success',
      });
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
        <Typography color="text.secondary">
          Select a classroom to view exam schedule.
        </Typography>
      </Paper>
    );
  }

  // Collect all exam dates for the dialog
  const allExamDates = (data?.upcoming || []).map((u) => u.exam_date);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, position: 'relative', pb: { xs: 8, md: 0 } }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
          <EventNoteOutlinedIcon sx={{ color: 'primary.main' }} />
          <Typography variant="h6" fontWeight={700} noWrap>
            NATA Exam Schedule
          </Typography>
        </Box>
        <TextField
          select
          value={phase}
          onChange={(e) => setPhase(e.target.value)}
          size="small"
          sx={{ minWidth: 130 }}
          InputProps={{ sx: { minHeight: 40 } }}
        >
          {PHASES.map((p) => (
            <MenuItem key={p.value} value={p.value}>
              {p.label}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Skeleton variant="rounded" height={70} />
          <Skeleton variant="rounded" height={150} />
          <Skeleton variant="rounded" height={150} />
        </Box>
      ) : data ? (
        <>
          {/* Desktop: two-column top section */}
          <Box
            sx={{
              display: { xs: 'flex', md: 'grid' },
              flexDirection: 'column',
              gridTemplateColumns: { md: data.recently_completed.length > 0 ? '1.5fr 1fr' : '1fr' },
              gap: 2,
            }}
          >
            <NotSubmittedBanner
              students={data.not_submitted}
              isTeacher={isTeacher}
              currentUserId={user?.id || ''}
              onRemind={handleRemind}
              onAddMyDate={() => setDialogOpen(true)}
              reminding={reminding}
            />
            <RecentlyCompletedSection
              students={data.recently_completed}
              isTeacher={isTeacher}
              currentUserId={user?.id || ''}
            />
          </Box>

          {/* Upcoming timeline */}
          <Box>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
              Upcoming Exams
            </Typography>
            {data.upcoming.length > 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {data.upcoming.map((dateData) => (
                  <ExamDateCard
                    key={dateData.exam_date.id}
                    data={dateData}
                    currentUserId={user?.id || ''}
                  />
                ))}
              </Box>
            ) : (
              <Paper
                variant="outlined"
                sx={{ p: 4, textAlign: 'center' }}
              >
                <EventNoteOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary">
                  No upcoming exam dates
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  {isTeacher
                    ? 'Add exam dates from the Documents page to get started.'
                    : 'Exam dates will appear here once your teacher adds them.'}
                </Typography>
              </Paper>
            )}
          </Box>
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

      {/* Add exam date dialog */}
      <AddExamDateDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        examDates={allExamDates}
        classroomId={activeClassroom.id}
        getToken={getToken}
        onSubmitted={handleDateSubmitted}
      />

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
