'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Typography, Snackbar, Alert, ToggleButton, ToggleButtonGroup, useMediaQuery, useTheme } from '@neram/ui';
import ViewListIcon from '@mui/icons-material/ViewList';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import WeeklyCalendarGrid, { getWeekDates } from '@/components/timetable/WeeklyCalendarGrid';
import TimeSlotGrid from '@/components/timetable/TimeSlotGrid';
import ClassReviewForm from '@/components/timetable/ClassReviewForm';
import ClassDetailPanel from '@/components/timetable/ClassDetailPanel';
import RsvpReasonDialog from '@/components/timetable/RsvpReasonDialog';
import TimetableNotificationBell from '@/components/timetable/TimetableNotificationBell';
import { type ClassCardData } from '@/components/timetable/ClassCard';
import { type HolidayInfo } from '@/components/timetable/WeeklyCalendarGrid';

export default function StudentTimetable() {
  const { activeClassroom, getToken } = useNexusAuthContext();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [classes, setClasses] = useState<ClassCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar');

  // Detail panel
  const [selectedClass, setSelectedClass] = useState<ClassCardData | null>(null);

  // RSVP state
  const [myRsvps, setMyRsvps] = useState<Record<string, 'attending' | 'not_attending'>>({});
  // Attendance state
  const [myAttendance, setMyAttendance] = useState<Record<string, boolean>>({});
  // Holidays
  const [holidays, setHolidays] = useState<Record<string, HolidayInfo>>({});
  // Review state
  const [reviewClass, setReviewClass] = useState<ClassCardData | null>(null);
  const [existingReview, setExistingReview] = useState<{ rating?: number; comment?: string }>({});

  // RSVP reason dialog
  const [rsvpReasonTarget, setRsvpReasonTarget] = useState<{ classId: string; classTitle: string } | null>(null);
  const [rsvpSubmitting, setRsvpSubmitting] = useState(false);

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

        const classIds = (data.classes || []).map((c: ClassCardData) => c.id);
        if (classIds.length > 0) {
          fetchMyData(classIds, token);
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

  const fetchMyData = async (classIds: string[], token: string) => {
    if (!activeClassroom) return;

    const rsvpPromises = classIds.map((id) =>
      fetch(`/api/timetable/rsvp?class_id=${id}&classroom_id=${activeClassroom.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.ok ? r.json() : null)
        .catch(() => null)
    );

    const attendancePromises = classIds.map((id) =>
      fetch(`/api/timetable/attendance-report?class_id=${id}&classroom_id=${activeClassroom.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.ok ? r.json() : null)
        .catch(() => null)
    );

    const [rsvpResults, attendanceResults] = await Promise.all([
      Promise.all(rsvpPromises),
      Promise.all(attendancePromises),
    ]);

    const rsvpMap: Record<string, 'attending' | 'not_attending'> = {};
    const attendanceMap: Record<string, boolean> = {};

    classIds.forEach((id, i) => {
      if (rsvpResults[i]?.rsvp?.response) {
        rsvpMap[id] = rsvpResults[i].rsvp.response;
      }
      if (attendanceResults[i]?.attendance) {
        attendanceMap[id] = attendanceResults[i].attendance.attended;
      }
    });

    setMyRsvps(rsvpMap);
    setMyAttendance(attendanceMap);
  };

  useEffect(() => {
    fetchClasses();
    fetchHolidays();
  }, [fetchClasses, fetchHolidays]);

  const handleRsvp = async (classId: string, response: 'attending' | 'not_attending') => {
    if (response === 'not_attending') {
      const cls = classes.find((c) => c.id === classId);
      setRsvpReasonTarget({ classId, classTitle: cls?.title || 'this class' });
      return;
    }
    await submitRsvp(classId, 'attending');
  };

  const submitRsvp = async (classId: string, response: 'attending' | 'not_attending', reason?: string) => {
    if (!activeClassroom) return;
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/timetable/rsvp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          class_id: classId,
          classroom_id: activeClassroom.id,
          response,
          reason: reason || undefined,
        }),
      });

      if (res.ok) {
        setMyRsvps((prev) => ({ ...prev, [classId]: response }));
        setSnackbar({
          open: true,
          message: response === 'attending' ? 'Marked as attending' : 'Marked as not attending',
          severity: 'success',
        });
      } else {
        const data = await res.json().catch(() => ({}));
        setSnackbar({ open: true, message: data.error || 'Failed to update RSVP', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to update RSVP', severity: 'error' });
    }
  };

  const handleRsvpReasonSubmit = async (reason: string) => {
    if (!rsvpReasonTarget) return;
    setRsvpSubmitting(true);
    await submitRsvp(rsvpReasonTarget.classId, 'not_attending', reason);
    setRsvpSubmitting(false);
    setRsvpReasonTarget(null);
  };

  const handleOpenRate = async (cls: ClassCardData) => {
    setReviewClass(cls);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/timetable/reviews?class_id=${cls.id}&classroom_id=${activeClassroom?.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        if (data.review) {
          setExistingReview({ rating: data.review.rating, comment: data.review.comment });
        } else {
          setExistingReview({});
        }
      }
    } catch {
      setExistingReview({});
    }
  };

  const handleSubmitReview = async (rating: number, comment: string) => {
    if (!reviewClass || !activeClassroom) return;
    const token = await getToken();
    if (!token) return;

    const res = await fetch('/api/timetable/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        class_id: reviewClass.id,
        classroom_id: activeClassroom.id,
        rating,
        comment,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to submit review');
    }

    setSnackbar({ open: true, message: 'Review submitted!', severity: 'success' });
  };

  return (
    <Box>
      {/* Header */}
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
          onClassClick={setSelectedClass}
        />
      ) : (
        <WeeklyCalendarGrid
          classes={classes}
          loading={loading}
          weekOffset={weekOffset}
          onWeekChange={setWeekOffset}
          role="student"
          holidays={holidays}
          myRsvps={myRsvps}
          myAttendance={myAttendance}
          onClassClick={setSelectedClass}
        />
      )}

      {/* Class Detail Panel */}
      <ClassDetailPanel
        cls={selectedClass}
        open={!!selectedClass}
        onClose={() => setSelectedClass(null)}
        role="student"
        classroomId={activeClassroom?.id || ''}
        getToken={getToken}
        myRsvp={selectedClass ? myRsvps[selectedClass.id] : null}
        myAttended={selectedClass ? myAttendance[selectedClass.id] ?? null : null}
        onRsvp={handleRsvp}
        onRate={handleOpenRate}
      />

      {/* RSVP Reason Dialog */}
      <RsvpReasonDialog
        open={!!rsvpReasonTarget}
        onClose={() => setRsvpReasonTarget(null)}
        classTitle={rsvpReasonTarget?.classTitle || ''}
        onSubmit={handleRsvpReasonSubmit}
        submitting={rsvpSubmitting}
      />

      {/* Review Dialog */}
      {reviewClass && (
        <ClassReviewForm
          open={!!reviewClass}
          onClose={() => setReviewClass(null)}
          classTitle={reviewClass.title}
          existingRating={existingReview.rating}
          existingComment={existingReview.comment}
          onSubmit={handleSubmitReview}
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
