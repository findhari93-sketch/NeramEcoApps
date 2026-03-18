'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Typography, Fab, Snackbar, Alert, Button, IconButton, ToggleButton, ToggleButtonGroup, useMediaQuery, useTheme } from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import AssessmentIcon from '@mui/icons-material/Assessment';
import ViewListIcon from '@mui/icons-material/ViewList';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import WeeklyCalendarGrid, { getWeekDates } from '@/components/timetable/WeeklyCalendarGrid';
import TimeSlotGrid from '@/components/timetable/TimeSlotGrid';
import ClassCreateDialog from '@/components/timetable/ClassCreateDialog';
import AttendanceSheet from '@/components/timetable/AttendanceSheet';
import ClassDetailPanel from '@/components/timetable/ClassDetailPanel';
import HolidayManager from '@/components/timetable/HolidayManager';
import RsvpDashboard from '@/components/timetable/RsvpDashboard';
import TimetableNotificationBell from '@/components/timetable/TimetableNotificationBell';
import { type ClassCardData } from '@/components/timetable/ClassCard';
import { type HolidayInfo } from '@/components/timetable/WeeklyCalendarGrid';

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
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [classes, setClasses] = useState<ClassCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  // Pre-fill data for calendar slot click
  const [prefillDate, setPrefillDate] = useState<string>('');
  const [prefillTime, setPrefillTime] = useState<string>('');

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassCardData | null>(null);
  const [attendanceClass, setAttendanceClass] = useState<ClassCardData | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassCardData | null>(null);
  const [holidayManagerOpen, setHolidayManagerOpen] = useState(false);
  const [rsvpDashboardOpen, setRsvpDashboardOpen] = useState(false);
  const [rsvpDashboardClassId, setRsvpDashboardClassId] = useState<string | undefined>();

  // Holidays
  const [holidays, setHolidays] = useState<Record<string, HolidayInfo>>({});

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

  const week = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  const fetchClasses = useCallback(async () => {
    if (!activeClassroom) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

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
  }, [activeClassroom, week.start, week.end, getToken]);

  const fetchHolidays = useCallback(async () => {
    if (!activeClassroom) return;
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/timetable/holidays?classroom_id=${activeClassroom.id}&start=${week.start}&end=${week.end}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        const map: Record<string, HolidayInfo> = {};
        for (const h of data.holidays || []) {
          map[h.holiday_date] = { title: h.title, description: h.description };
        }
        setHolidays(map);
      }
    } catch {
      // ignore
    }
  }, [activeClassroom, week.start, week.end, getToken]);

  const fetchRsvpAndRatings = async (classIds: string[], token: string) => {
    if (!activeClassroom) return;

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
    fetchHolidays();
  }, [fetchClasses, fetchHolidays]);

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

  const handleClassClick = (cls: ClassCardData) => {
    setSelectedClass(cls);
  };

  const handleEdit = (cls: ClassCardData) => {
    setSelectedClass(null);
    setEditingClass(cls);
    setCreateDialogOpen(true);
  };

  const handleDelete = async (classId: string) => {
    if (!activeClassroom) return;
    setSelectedClass(null);
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
          severity: 'success',
        });
        fetchClasses();
      } else {
        setSnackbar({ open: true, message: data.error || 'Sync failed', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to sync recording', severity: 'error' });
    }
  };

  const handleViewRsvpDashboard = (classId: string) => {
    setRsvpDashboardClassId(classId);
    setRsvpDashboardOpen(true);
  };

  const handleSlotClick = (date: string, startTime: string) => {
    setPrefillDate(date);
    setPrefillTime(startTime);
    setEditingClass(null);
    setCreateDialogOpen(true);
  };

  const getClassesOnDate = (date: string) => {
    return classes
      .filter((c) => c.scheduled_date === date && c.status !== 'cancelled')
      .map((c) => ({ id: c.id, title: c.title, start_time: c.start_time, end_time: c.end_time }));
  };

  const handleCancelClassForHoliday = async (classId: string) => {
    if (!activeClassroom) return;
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

    if (!res.ok) {
      throw new Error('Failed to cancel class');
    }
  };

  const handleRemoveHolidayForClass = async (date: string) => {
    if (!activeClassroom) return;
    const token = await getToken();
    if (!token) return;

    // Find the holiday id for this date
    const res = await fetch(
      `/api/timetable/holidays?classroom_id=${activeClassroom.id}&start=${date}&end=${date}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (res.ok) {
      const data = await res.json();
      const holiday = (data.holidays || []).find((h: { holiday_date: string }) => h.holiday_date === date);
      if (holiday) {
        const delRes = await fetch('/api/timetable/holidays', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ id: holiday.id, classroom_id: activeClassroom.id }),
        });

        if (!delRes.ok) throw new Error('Failed to remove holiday');
        fetchHolidays();
      }
    }
  };

  return (
    <Box sx={{ position: 'relative', minHeight: '60vh' }}>
      {/* Header with toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          Timetable
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {isDesktop && (
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_, v) => v && setViewMode(v)}
              size="small"
              sx={{ mr: 0.5 }}
            >
              <ToggleButton value="list" sx={{ minWidth: 36, minHeight: 36 }}>
                <ViewListIcon fontSize="small" />
              </ToggleButton>
              <ToggleButton value="calendar" sx={{ minWidth: 36, minHeight: 36 }}>
                <CalendarMonthIcon fontSize="small" />
              </ToggleButton>
            </ToggleButtonGroup>
          )}
          <Button
            size="small"
            variant="outlined"
            startIcon={<EventBusyIcon />}
            onClick={() => setHolidayManagerOpen(true)}
            sx={{ textTransform: 'none', minHeight: 40 }}
          >
            Holidays
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<AssessmentIcon />}
            onClick={() => {
              setRsvpDashboardClassId(undefined);
              setRsvpDashboardOpen(true);
            }}
            sx={{ textTransform: 'none', minHeight: 40 }}
          >
            RSVP
          </Button>
          {activeClassroom && (
            <TimetableNotificationBell
              classroomId={activeClassroom.id}
              getToken={getToken}
            />
          )}
        </Box>
      </Box>

      {viewMode === 'calendar' && isDesktop ? (
        <TimeSlotGrid
          classes={classes}
          weekOffset={weekOffset}
          onWeekChange={setWeekOffset}
          holidays={holidays}
          onSlotClick={handleSlotClick}
          onClassClick={handleClassClick}
        />
      ) : (
        <WeeklyCalendarGrid
          classes={classes}
          loading={loading}
          weekOffset={weekOffset}
          onWeekChange={setWeekOffset}
          role="teacher"
          holidays={holidays}
          rsvpData={rsvpData}
          averageRatings={averageRatings}
          onClassClick={handleClassClick}
        />
      )}

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

      {/* Class Detail Panel */}
      <ClassDetailPanel
        cls={selectedClass}
        open={!!selectedClass}
        onClose={() => setSelectedClass(null)}
        role="teacher"
        classroomId={activeClassroom?.id || ''}
        getToken={getToken}
        rsvpSummary={selectedClass ? rsvpData[selectedClass.id] : null}
        averageRating={selectedClass ? averageRatings[selectedClass.id] : null}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onViewAttendance={setAttendanceClass}
        onSyncRecording={handleSyncRecording}
        onViewRsvpDashboard={handleViewRsvpDashboard}
      />

      {/* Create/Edit Dialog */}
      <ClassCreateDialog
        open={createDialogOpen}
        onClose={() => {
          setCreateDialogOpen(false);
          setEditingClass(null);
          setPrefillDate('');
          setPrefillTime('');
        }}
        editingClass={editingClass}
        topics={topics}
        batches={batches}
        classroomId={activeClassroom?.id || ''}
        getToken={getToken}
        onSaved={() => {
          setSnackbar({ open: true, message: editingClass ? 'Class updated' : 'Class created', severity: 'success' });
          fetchClasses();
          fetchHolidays();
          setPrefillDate('');
          setPrefillTime('');
        }}
        prefillDate={prefillDate}
        prefillTime={prefillTime}
        holidays={holidays}
        onRemoveHoliday={handleRemoveHolidayForClass}
      />

      {/* Holiday Manager */}
      <HolidayManager
        open={holidayManagerOpen}
        onClose={() => setHolidayManagerOpen(false)}
        classroomId={activeClassroom?.id || ''}
        getToken={getToken}
        onHolidaysChanged={() => { fetchHolidays(); fetchClasses(); }}
        getClassesOnDate={getClassesOnDate}
        onCancelClass={handleCancelClassForHoliday}
      />

      {/* RSVP Dashboard */}
      <RsvpDashboard
        open={rsvpDashboardOpen}
        onClose={() => {
          setRsvpDashboardOpen(false);
          setRsvpDashboardClassId(undefined);
        }}
        classroomId={activeClassroom?.id || ''}
        getToken={getToken}
        classId={rsvpDashboardClassId}
        startDate={week.start}
        endDate={week.end}
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
