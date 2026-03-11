'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  Avatar,
  Button,
  LinearProgress,
  Divider,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface StudentDetail {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  enrollment_date: string | null;
  attendance: {
    attended: number;
    total: number;
    percentage: number;
  };
  checklist: {
    completed: number;
    total: number;
    percentage: number;
  };
  topics: {
    completed: number;
    total: number;
  };
}

export default function StudentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const studentId = params.id as string;

  useEffect(() => {
    if (!activeClassroom || !studentId) return;

    async function fetchStudent() {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) return;

        const res = await fetch(
          `/api/students/${studentId}?classroom=${activeClassroom!.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (res.ok) {
          const data = await res.json();
          setStudent(data.student || data);
        }
      } catch (err) {
        console.error('Failed to load student:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchStudent();
  }, [activeClassroom, studentId, getToken]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={48} sx={{ borderRadius: 1, mb: 2 }} />
        <Skeleton variant="circular" width={80} height={80} sx={{ mx: 'auto', mb: 2 }} />
        <Skeleton variant="rectangular" height={24} sx={{ borderRadius: 1, mb: 1, mx: 'auto', maxWidth: 200 }} />
        <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1, mb: 2 }} />
        <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1, mb: 2 }} />
        <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 1 }} />
      </Box>
    );
  }

  if (!student) {
    return (
      <Box>
        <Button
          onClick={() => router.push('/teacher/students')}
          sx={{ textTransform: 'none', minHeight: 48, mb: 2 }}
        >
          &#8592; Back to Students
        </Button>
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Student not found.
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box>
      {/* Back Button */}
      <Button
        onClick={() => router.push('/teacher/students')}
        sx={{ textTransform: 'none', minHeight: 48, mb: 2 }}
      >
        &#8592; Back to Students
      </Button>

      {/* Student Header */}
      <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 2, textAlign: 'center' }}>
        <Avatar
          src={student.avatar_url || undefined}
          sx={{ width: 80, height: 80, mx: 'auto', mb: 1.5, fontSize: '2rem' }}
        >
          {getInitials(student.name)}
        </Avatar>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {student.name}
        </Typography>
        {student.email && (
          <Typography variant="body2" color="text.secondary">
            {student.email}
          </Typography>
        )}
        {student.enrollment_date && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            Enrolled: {formatDate(student.enrollment_date)}
          </Typography>
        )}
      </Paper>

      {/* Attendance Summary */}
      <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
          Attendance
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {student.attendance.attended} / {student.attendance.total} classes
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {Math.round(student.attendance.percentage)}%
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={student.attendance.percentage}
          color={student.attendance.percentage >= 75 ? 'success' : 'warning'}
          sx={{ height: 8, borderRadius: 4 }}
        />
      </Paper>

      {/* Checklist Progress */}
      <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
          Checklist Progress
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {student.checklist.completed} / {student.checklist.total} items
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {Math.round(student.checklist.percentage)}%
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={student.checklist.percentage}
          color={student.checklist.percentage >= 50 ? 'info' : 'warning'}
          sx={{ height: 8, borderRadius: 4 }}
        />
      </Paper>

      {/* Topic Progress */}
      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
          Topic Progress
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="body2" color="text.secondary">
            Topics completed
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {student.topics.completed} / {student.topics.total}
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}
