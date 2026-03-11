'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  TextField,
  Button,
  Checkbox,
  Avatar,
  Chip,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface ScheduledClass {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  status: string;
  topic: { title: string } | null;
}

interface StudentAttendance {
  id: string;
  name: string;
  avatar_url: string | null;
  present: boolean;
}

interface ClassAttendanceState {
  students: StudentAttendance[];
  expanded: boolean;
  submitting: boolean;
  submitted: boolean;
}

export default function TeacherAttendance() {
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [classes, setClasses] = useState<ScheduledClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, ClassAttendanceState>>({});

  const formatTime = (time: string) => {
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${hour % 12 || 12}:${m} ${ampm}`;
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Fetch classes for selected date
  useEffect(() => {
    if (!activeClassroom || !selectedDate) return;

    async function fetchSchedule() {
      setLoading(true);
      setAttendanceMap({});
      try {
        const token = await getToken();
        if (!token) return;

        const res = await fetch(
          `/api/timetable?classroom=${activeClassroom!.id}&start=${selectedDate}&end=${selectedDate}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (res.ok) {
          const data = await res.json();
          setClasses(data.classes || []);
        }
      } catch (err) {
        console.error('Failed to load schedule:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchSchedule();
  }, [activeClassroom, selectedDate, getToken]);

  // Fetch attendance for a specific class when expanded
  const fetchAttendance = useCallback(
    async (classId: string) => {
      if (!activeClassroom) return;
      try {
        const token = await getToken();
        if (!token) return;

        const res = await fetch(
          `/api/attendance?classroom=${activeClassroom.id}&class_id=${classId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (res.ok) {
          const data = await res.json();
          setAttendanceMap((prev) => ({
            ...prev,
            [classId]: {
              students: data.students || [],
              expanded: true,
              submitting: false,
              submitted: false,
            },
          }));
        }
      } catch (err) {
        console.error('Failed to load attendance:', err);
      }
    },
    [activeClassroom, getToken]
  );

  const toggleExpand = (classId: string) => {
    const current = attendanceMap[classId];
    if (current?.expanded) {
      setAttendanceMap((prev) => ({
        ...prev,
        [classId]: { ...current, expanded: false },
      }));
    } else if (current?.students) {
      setAttendanceMap((prev) => ({
        ...prev,
        [classId]: { ...current, expanded: true },
      }));
    } else {
      fetchAttendance(classId);
    }
  };

  const toggleStudentPresence = (classId: string, studentId: string) => {
    setAttendanceMap((prev) => {
      const current = prev[classId];
      if (!current) return prev;
      return {
        ...prev,
        [classId]: {
          ...current,
          students: current.students.map((s) =>
            s.id === studentId ? { ...s, present: !s.present } : s
          ),
        },
      };
    });
  };

  const submitAttendance = async (classId: string) => {
    if (!activeClassroom) return;
    const state = attendanceMap[classId];
    if (!state) return;

    setAttendanceMap((prev) => ({
      ...prev,
      [classId]: { ...state, submitting: true },
    }));

    try {
      const token = await getToken();
      if (!token) return;

      const presentStudentIds = state.students
        .filter((s) => s.present)
        .map((s) => s.id);

      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          class_id: classId,
          classroom_id: activeClassroom.id,
          student_ids: presentStudentIds,
        }),
      });

      if (res.ok) {
        setAttendanceMap((prev) => ({
          ...prev,
          [classId]: { ...state, submitting: false, submitted: true },
        }));
      }
    } catch (err) {
      console.error('Failed to submit attendance:', err);
      setAttendanceMap((prev) => ({
        ...prev,
        [classId]: { ...state, submitting: false },
      }));
    }
  };

  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 2 }}>
        Attendance
      </Typography>

      {/* Date Picker */}
      <TextField
        type="date"
        fullWidth
        value={selectedDate}
        onChange={(e) => setSelectedDate(e.target.value)}
        size="small"
        sx={{ mb: 2 }}
        InputLabelProps={{ shrink: true }}
        label="Select Date"
      />

      {/* Classes for the Day */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[1, 2].map((i) => (
            <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : classes.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            No classes scheduled for this date.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {classes.map((cls) => {
            const state = attendanceMap[cls.id];
            const isExpanded = state?.expanded;

            return (
              <Paper key={cls.id} variant="outlined" sx={{ overflow: 'hidden' }}>
                {/* Class Header - Expandable */}
                <Box
                  onClick={() => toggleExpand(cls.id)}
                  sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    minHeight: 48,
                    '&:hover': { backgroundColor: 'action.hover' },
                    '&:active': { backgroundColor: 'action.selected' },
                  }}
                >
                  <Box>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      {cls.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatTime(cls.start_time)} - {formatTime(cls.end_time)}
                      {cls.topic && ` · ${cls.topic.title}`}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {state?.submitted && (
                      <Chip label="Saved" size="small" color="success" />
                    )}
                    <Typography variant="body2" color="text.secondary">
                      {isExpanded ? '▲' : '▼'}
                    </Typography>
                  </Box>
                </Box>

                {/* Student List */}
                {isExpanded && state && (
                  <Box sx={{ px: 2, pb: 2 }}>
                    {state.students.length === 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                        No students enrolled.
                      </Typography>
                    ) : (
                      <>
                        <Box
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            mb: 1,
                            pt: 1,
                            borderTop: '1px solid',
                            borderColor: 'divider',
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            {state.students.filter((s) => s.present).length} /{' '}
                            {state.students.length} present
                          </Typography>
                        </Box>

                        {state.students.map((student) => (
                          <Box
                            key={student.id}
                            onClick={() => toggleStudentPresence(cls.id, student.id)}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1.5,
                              py: 1,
                              px: 0.5,
                              cursor: 'pointer',
                              minHeight: 48,
                              borderRadius: 1,
                              '&:hover': { backgroundColor: 'action.hover' },
                              '&:active': { backgroundColor: 'action.selected' },
                            }}
                          >
                            <Checkbox
                              checked={student.present}
                              onChange={() => toggleStudentPresence(cls.id, student.id)}
                              sx={{ p: 0.5, '& .MuiSvgIcon-root': { fontSize: 28 } }}
                            />
                            <Avatar
                              src={student.avatar_url || undefined}
                              sx={{ width: 36, height: 36, fontSize: '0.875rem' }}
                            >
                              {getInitials(student.name)}
                            </Avatar>
                            <Typography variant="body2" sx={{ flex: 1 }}>
                              {student.name}
                            </Typography>
                          </Box>
                        ))}

                        <Button
                          variant="contained"
                          fullWidth
                          onClick={() => submitAttendance(cls.id)}
                          disabled={state.submitting}
                          sx={{ mt: 2, minHeight: 48 }}
                        >
                          {state.submitting
                            ? 'Saving...'
                            : state.submitted
                              ? 'Update Attendance'
                              : 'Save Attendance'}
                        </Button>
                      </>
                    )}
                  </Box>
                )}
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
