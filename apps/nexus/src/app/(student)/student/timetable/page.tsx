'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Snackbar, Alert } from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import WeeklyCalendarGrid, { getWeekDates } from '@/components/timetable/WeeklyCalendarGrid';
import ClassReviewForm from '@/components/timetable/ClassReviewForm';
import { type ClassCardData } from '@/components/timetable/ClassCard';

export default function StudentTimetable() {
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [classes, setClasses] = useState<ClassCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);

  // RSVP state
  const [myRsvps, setMyRsvps] = useState<Record<string, 'attending' | 'not_attending'>>({});
  // Attendance state
  const [myAttendance, setMyAttendance] = useState<Record<string, boolean>>({});
  // Review state
  const [reviewClass, setReviewClass] = useState<ClassCardData | null>(null);
  const [existingReview, setExistingReview] = useState<{ rating?: number; comment?: string }>({});

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

        // Fetch student's RSVPs and attendance for each class
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
  }, [activeClassroom, weekOffset, getToken]);

  const fetchMyData = async (classIds: string[], token: string) => {
    if (!activeClassroom) return;

    // Fetch RSVPs and attendance in parallel
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
  }, [fetchClasses]);

  const handleRsvp = async (classId: string, response: 'attending' | 'not_attending') => {
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
        }),
      });

      if (res.ok) {
        setMyRsvps((prev) => ({ ...prev, [classId]: response }));
        setSnackbar({
          open: true,
          message: response === 'attending' ? 'Marked as attending' : 'Marked as not attending',
          severity: 'success',
        });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to update RSVP', severity: 'error' });
    }
  };

  const handleOpenRate = async (cls: ClassCardData) => {
    setReviewClass(cls);
    // Fetch existing review
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
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 2 }}>
        Timetable
      </Typography>

      <WeeklyCalendarGrid
        classes={classes}
        loading={loading}
        weekOffset={weekOffset}
        onWeekChange={setWeekOffset}
        role="student"
        myRsvps={myRsvps}
        myAttendance={myAttendance}
        onRsvp={handleRsvp}
        onRate={handleOpenRate}
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
