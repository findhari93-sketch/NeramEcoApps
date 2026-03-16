'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  IconButton,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import GraphAvatar from '@/components/GraphAvatar';

interface ClassroomDetail {
  id: string;
  name: string;
  type: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

interface Enrollment {
  id: string;
  user_id: string;
  role: string;
  batch_id: string | null;
  user: { id: string; name: string; email: string; avatar_url: string | null; ms_oid?: string | null };
  batch: { id: string; name: string } | null;
}

const typeLabels: Record<string, string> = {
  nata: 'NATA',
  jee: 'JEE',
  revit: 'Revit',
  other: 'Other',
};

export default function StudentClassroomDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getToken, user } = useNexusAuthContext();

  const [classroom, setClassroom] = useState<ClassroomDetail | null>(null);
  const [teachers, setTeachers] = useState<Enrollment[]>([]);
  const [myEnrollment, setMyEnrollment] = useState<Enrollment | null>(null);
  const [stats, setStats] = useState({ totalStudents: 0, totalTeachers: 0 });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const headers = { Authorization: `Bearer ${token}` };

      const [classroomRes, teachersRes, studentsRes] = await Promise.all([
        fetch(`/api/classrooms/${id}`, { headers }),
        fetch(`/api/classrooms/${id}/enrollments?role=teacher`, { headers }),
        fetch(`/api/classrooms/${id}/enrollments?role=student`, { headers }),
      ]);

      if (classroomRes.ok) {
        const data = await classroomRes.json();
        setClassroom(data.classroom);
        setStats(data.stats || { totalStudents: 0, totalTeachers: 0 });
      }

      if (teachersRes.ok) {
        const data = await teachersRes.json();
        setTeachers(data.enrollments || []);
      }

      if (studentsRes.ok && user?.id) {
        const data = await studentsRes.json();
        const mine = (data.enrollments || []).find((e: Enrollment) => e.user_id === user.id);
        if (mine) setMyEnrollment(mine);
      }
    } catch (err) {
      console.error('Failed to load classroom:', err);
    } finally {
      setLoading(false);
    }
  }, [id, getToken, user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={40} width={200} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2, mb: 2 }} />
        <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  if (!classroom) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="error">Classroom not found</Typography>
      </Paper>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton onClick={() => router.push('/student/dashboard')} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }} noWrap>
              {classroom.name}
            </Typography>
            <Chip
              label={typeLabels[classroom.type] || classroom.type}
              size="small"
              color="primary"
              variant="outlined"
            />
          </Box>
          {classroom.description && (
            <Typography variant="body2" color="text.secondary">
              {classroom.description}
            </Typography>
          )}
        </Box>
      </Box>

      {/* Stats row */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Paper variant="outlined" sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <SchoolOutlinedIcon color="secondary" fontSize="small" />
          <Typography variant="body2">
            <strong>{stats.totalTeachers}</strong> teachers
          </Typography>
        </Paper>
        <Paper variant="outlined" sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <PeopleOutlinedIcon color="primary" fontSize="small" />
          <Typography variant="body2">
            <strong>{stats.totalStudents}</strong> students
          </Typography>
        </Paper>
      </Box>

      {/* My enrollment info */}
      {myEnrollment && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Your Enrollment
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="caption" color="text.secondary">Role</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, textTransform: 'capitalize' }}>
                {myEnrollment.role}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Batch</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {myEnrollment.batch?.name || 'Unassigned'}
              </Typography>
            </Box>
          </Box>
        </Paper>
      )}

      {/* Teachers */}
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        Teachers
      </Typography>
      {teachers.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center', mb: 3 }}>
          <Typography variant="body2" color="text.secondary">
            No teachers assigned yet.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 3 }}>
          {teachers.map((enrollment) => (
            <Paper
              key={enrollment.id}
              variant="outlined"
              sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                minHeight: 48,
              }}
            >
              <GraphAvatar
                msOid={enrollment.user.ms_oid}
                name={enrollment.user.name}
                size={40}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                  {enrollment.user.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {enrollment.user.email}
                </Typography>
              </Box>
              <Chip label="Teacher" size="small" color="secondary" variant="outlined" />
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}
