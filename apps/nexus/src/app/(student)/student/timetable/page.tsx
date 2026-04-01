'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Typography, Snackbar, Alert, Button, IconButton, ToggleButton, ToggleButtonGroup, Chip, useMediaQuery, useTheme } from '@neram/ui';
import ViewListIcon from '@mui/icons-material/ViewList';
import CloseIcon from '@mui/icons-material/Close';
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

interface ClassroomInfo {
  id: string;
  name: string;
  type: string;
}

export default function StudentTimetable() {
  const { activeClassroom, getToken } = useNexusAuthContext();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [allClasses, setAllClasses] = useState<ClassCardData[]>([]);
  const [enrolledClassrooms, setEnrolledClassrooms] = useState<ClassroomInfo[]>([]);
  const [classroomFilter, setClassroomFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar');

  const [liveBannerDismissed, setLiveBannerDismissed] = useState(false);

  // Filtered classes based on classroom filter
  const classes = classroomFilter === 'all'
    ? allClasses
    : allClasses.filter((c) => c.classroom?.id === classroomFilter);

  // Find the nearest live class with a meeting URL
  const liveClass = !liveBannerDismissed
    ? allClasses.find(
        (c) => c.status === 'live' && (c.teams_meeting_join_url || c.teams_meeting_url)
      )
    : null;

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
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      // Use unified my-schedule API to get classes from ALL enrolled classrooms
      const res = await fetch(
        `/api/timetable/my-schedule?start=${week.start}&end=${week.end}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        setAllClasses(data.classes || []);
        setEnrolledClassrooms(data.classrooms || []);

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
  }, [week.start, week.end, getToken]);

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
    // Use the first available classroom for RSVP/attendance queries
    // These APIs just verify enrollment, any enrolled classroom works
    const fallbackClassroomId = activeClassroom?.id || enrolledClassrooms[0]?.id || '';

    const rsvpPromises = classIds.map((id) =>
      fetch(`/api/timetable/rsvp?class_id=${id}&classroom_id=${fallbackClassroomId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.ok ? r.json() : null)
        .catch(() => null)
    );

    const attendancePromises = classIds.map((id) =>
      fetch(`/api/timetable/attendance-report?class_id=${id}&classroom_id=${fallbackClassroomId}`, {
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

  useEffect(() => {
    setLiveBannerDismissed(false);
  }, [allClasses]);

  const handleRsvp = async (classId: string, response: 'attending' | 'not_attending') => {
    if (response === 'not_attending') {
      const cls = classes.find((c) => c.id === classId);
      setRsvpReasonTarget({ classId, classTitle: cls?.title || 'this class' });
      return;
    }
    await submitRsvp(classId, 'attending');
  };

  const submitRsvp = async (classId: string, response: 'attending' | 'not_attending', reason?: string) => {
    // Find the classroom_id from the class itself
    const cls = allClasses.find((c) => c.id === classId);
    const classroomId = cls?.classroom?.id || activeClassroom?.id;
    if (!classroomId) return;
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
          classroom_id: classroomId,
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

      const reviewClassroomId = cls.classroom?.id || activeClassroom?.id || '';
      const res = await fetch(
        `/api/timetable/reviews?class_id=${cls.id}&classroom_id=${reviewClassroomId}`,
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
    if (!reviewClass) return;
    const reviewClassroomId = reviewClass.classroom?.id || activeClassroom?.id;
    if (!reviewClassroomId) return;
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
        classroom_id: reviewClassroomId,
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
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
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

      {/* Classroom filter chips */}
      {enrolledClassrooms.length > 1 && (
        <Box sx={{ display: 'flex', gap: 0.75, mb: 2, flexWrap: 'wrap' }}>
          <Chip
            label="All"
            size="small"
            variant={classroomFilter === 'all' ? 'filled' : 'outlined'}
            color={classroomFilter === 'all' ? 'primary' : 'default'}
            onClick={() => setClassroomFilter('all')}
            sx={{ minHeight: 32, fontWeight: 600 }}
          />
          {enrolledClassrooms
            .filter((c) => c.type !== 'common')
            .map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                size="small"
                variant={classroomFilter === c.id ? 'filled' : 'outlined'}
                color={classroomFilter === c.id ? (c.type === 'nata' ? 'primary' : c.type === 'jee' ? 'secondary' : 'default') : 'default'}
                onClick={() => setClassroomFilter(c.id)}
                sx={{ minHeight: 32 }}
              />
            ))}
          {enrolledClassrooms.some((c) => c.type === 'common') && (
            <Chip
              label="Common"
              size="small"
              variant={classroomFilter === enrolledClassrooms.find((c) => c.type === 'common')?.id ? 'filled' : 'outlined'}
              color={classroomFilter === enrolledClassrooms.find((c) => c.type === 'common')?.id ? 'warning' : 'default'}
              onClick={() => {
                const common = enrolledClassrooms.find((c) => c.type === 'common');
                if (common) setClassroomFilter(common.id);
              }}
              sx={{ minHeight: 32 }}
            />
          )}
        </Box>
      )}

      {/* Live class banner */}
      {liveClass && (
        <Alert
          severity="info"
          variant="filled"
          sx={{
            mb: 2,
            bgcolor: 'success.main',
            '& .MuiAlert-icon': { color: 'white' },
            '& .MuiAlert-message': { color: 'white', width: '100%' },
            '& .MuiAlert-action': { color: 'white' },
          }}
          action={
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Button
                color="inherit"
                size="small"
                variant="outlined"
                href={liveClass.teams_meeting_join_url || liveClass.teams_meeting_url || ''}
                target="_blank"
                sx={{ fontWeight: 700, borderColor: 'white', color: 'white', minHeight: 36 }}
              >
                Join Now
              </Button>
              <IconButton
                size="small"
                color="inherit"
                onClick={() => setLiveBannerDismissed(true)}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          }
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {liveClass.title} is live now!
          </Typography>
        </Alert>
      )}

      {viewMode === 'calendar' && isDesktop ? (
        <TimeSlotGrid
          classes={classes}
          weekOffset={weekOffset}
          onWeekChange={setWeekOffset}
          holidays={holidays}
          onClassClick={setSelectedClass}
          role="student"
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
        classroomId={selectedClass?.classroom?.id || activeClassroom?.id || ''}
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
