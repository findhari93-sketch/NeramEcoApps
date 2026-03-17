'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Fab, Snackbar, Alert } from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import WeeklyCalendarGrid, { getWeekDates } from '@/components/timetable/WeeklyCalendarGrid';
import ClassCreateDialog from '@/components/timetable/ClassCreateDialog';
import AttendanceSheet from '@/components/timetable/AttendanceSheet';
import { type ClassCardData } from '@/components/timetable/ClassCard';

interface TopicOption {
  id: string;
  title: string;
  category: string;
}

interface BatchOption {
  id: string;
  name: string;
}

export default function TeacherTimetable() {
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [classes, setClasses] = useState<ClassCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassCardData | null>(null);
  const [attendanceClass, setAttendanceClass] = useState<ClassCardData | null>(null);

  // RSVP data
  const [rsvpData, setRsvpData] = useState<Record<string, { attending: number; total: number }>>({});
  // Rating data
  const [averageRatings, setAverageRatings] = useState<Record<string, number>>({});

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const fetchClasses = useCallback(async () => {
    if (!activeClassroom) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const week = getWeekDates(weekOffset);
      const res = await fetch(
        `/api/timetable?classroom=${activeClassroom.id}&start=${week.start}&end=${week.end}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        setClasses(data.classes || []);

        // Fetch RSVP summaries and ratings for each class
        const classIds = (data.classes || []).map((c: ClassCardData) => c.id);
        if (classIds.length > 0) {
          fetchRsvpAndRatings(classIds, token);
        }
      }
    } catch (err) {
      console.error('Failed to load timetable:', err);
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, weekOffset, getToken]);

  const fetchRsvpAndRatings = async (classIds: string[], token: string) => {
    if (!activeClassroom) return;

    // Fetch in parallel for all classes
    const rsvpPromises = classIds.map((id) =>
      fetch(`/api/timetable/rsvp?class_id=${id}&classroom_id=${activeClassroom.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.ok ? r.json() : null)
        .catch(() => null)
    );

    const ratingPromises = classIds.map((id) =>
      fetch(`/api/timetable/reviews?class_id=${id}&classroom_id=${activeClassroom.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.ok ? r.json() : null)
        .catch(() => null)
    );

    const [rsvpResults, ratingResults] = await Promise.all([
      Promise.all(rsvpPromises),
      Promise.all(ratingPromises),
    ]);

    const rsvpMap: Record<string, { attending: number; total: number }> = {};
    const ratingMap: Record<string, number> = {};

    classIds.forEach((id, i) => {
      if (rsvpResults[i]?.summary) {
        rsvpMap[id] = rsvpResults[i].summary;
      }
      if (ratingResults[i]?.summary?.average) {
        ratingMap[id] = ratingResults[i].summary.average;
      }
    });

    setRsvpData(rsvpMap);
    setAverageRatings(ratingMap);
  };

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  // Fetch topics and batches for create dialog
  useEffect(() => {
    if (!activeClassroom) return;

    async function fetchMeta() {
      try {
        const token = await getToken();
        if (!token) return;

        const [topicsRes, batchesRes] = await Promise.all([
          fetch(`/api/topics?classroom=${activeClassroom!.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/classrooms/${activeClassroom!.id}/batches`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (topicsRes.ok) {
          const data = await topicsRes.json();
          setTopics(data.topics || []);
        }
        if (batchesRes.ok) {
          const data = await batchesRes.json();
          setBatches(data.batches || []);
        }
      } catch (err) {
        console.error('Failed to load metadata:', err);
      }
    }

    fetchMeta();
  }, [activeClassroom, getToken]);

  const handleEdit = (cls: ClassCardData) => {
    setEditingClass(cls);
    setCreateDialogOpen(true);
  };

  const handleDelete = async (classId: string) => {
    if (!activeClassroom) return;
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/timetable', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: classId, classroom_id: activeClassroom.id }),
      });

      if (res.ok) {
        setSnackbar({ open: true, message: 'Class cancelled', severity: 'success' });
        fetchClasses();
      }
    } catch (err) {
      console.error('Failed to cancel class:', err);
    }
  };

  const handleSyncRecording = async (cls: ClassCardData) => {
    if (!activeClassroom) return;
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/timetable/recording', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          class_id: cls.id,
          classroom_id: activeClassroom.id,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSnackbar({
          open: true,
          message: data.found ? 'Recording synced!' : 'No recording found yet',
          severity: data.found ? 'success' : 'success',
        });
        fetchClasses();
      } else {
        setSnackbar({ open: true, message: data.error || 'Sync failed', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to sync recording', severity: 'error' });
    }
  };

  return (
    <Box sx={{ position: 'relative', minHeight: '60vh' }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 2 }}>
        Timetable
      </Typography>

      <WeeklyCalendarGrid
        classes={classes}
        loading={loading}
        weekOffset={weekOffset}
        onWeekChange={setWeekOffset}
        role="teacher"
        rsvpData={rsvpData}
        averageRatings={averageRatings}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onViewAttendance={setAttendanceClass}
        onSyncRecording={handleSyncRecording}
      />

      {/* Add Class FAB */}
      <Fab
        color="primary"
        aria-label="Add class"
        onClick={() => {
          setEditingClass(null);
          setCreateDialogOpen(true);
        }}
        sx={{
          position: 'fixed',
          bottom: { xs: 80, md: 24 },
          right: { xs: 16, md: 24 },
          width: 56,
          height: 56,
        }}
      >
        <AddIcon />
      </Fab>

      {/* Create/Edit Dialog */}
      <ClassCreateDialog
        open={createDialogOpen}
        onClose={() => {
          setCreateDialogOpen(false);
          setEditingClass(null);
        }}
        editingClass={editingClass}
        topics={topics}
        batches={batches}
        classroomId={activeClassroom?.id || ''}
        getToken={getToken}
        onSaved={() => {
          setSnackbar({ open: true, message: editingClass ? 'Class updated' : 'Class created', severity: 'success' });
          fetchClasses();
        }}
      />

      {/* Attendance Sheet */}
      {attendanceClass && (
        <AttendanceSheet
          open={!!attendanceClass}
          onClose={() => setAttendanceClass(null)}
          classId={attendanceClass.id}
          classTitle={attendanceClass.title}
          classroomId={activeClassroom?.id || ''}
          teamsMeetingId={attendanceClass.teams_meeting_id}
          getToken={getToken}
        />
      )}

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
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
