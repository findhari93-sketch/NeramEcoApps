'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  TextField,
  Avatar,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface EnrolledStudent {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  attendance_percentage: number;
  checklist_percentage: number;
}

export default function TeacherStudents() {
  const router = useRouter();
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!activeClassroom) return;

    async function fetchStudents() {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) return;

        const res = await fetch(
          `/api/students?classroom=${activeClassroom!.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (res.ok) {
          const data = await res.json();
          setStudents(data.students || []);
        }
      } catch (err) {
        console.error('Failed to load students:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchStudents();
  }, [activeClassroom, getToken]);

  const filteredStudents = students.filter((s) => {
    const query = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(query) ||
      (s.email && s.email.toLowerCase().includes(query))
    );
  });

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 2 }}>
        Students
      </Typography>

      {/* Search */}
      <TextField
        fullWidth
        placeholder="Search by name or email..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        size="small"
        sx={{ mb: 2 }}
        inputProps={{ style: { minHeight: 24 } }}
      />

      {/* Student List */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : filteredStudents.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {searchQuery ? 'No students match your search.' : 'No students enrolled.'}
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {filteredStudents.map((student) => (
            <Paper
              key={student.id}
              variant="outlined"
              onClick={() => router.push(`/teacher/students/${student.id}`)}
              sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                cursor: 'pointer',
                minHeight: 48,
                '&:hover': { backgroundColor: 'action.hover' },
                '&:active': { backgroundColor: 'action.selected' },
              }}
            >
              <Avatar
                src={student.avatar_url || undefined}
                sx={{ width: 48, height: 48 }}
              >
                {getInitials(student.name)}
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body1" sx={{ fontWeight: 600 }} noWrap>
                  {student.name}
                </Typography>
                {student.email && (
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {student.email}
                  </Typography>
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                <Chip
                  label={`${Math.round(student.attendance_percentage)}% att`}
                  size="small"
                  color={student.attendance_percentage >= 75 ? 'success' : 'warning'}
                  variant="outlined"
                />
                <Chip
                  label={`${Math.round(student.checklist_percentage)}% done`}
                  size="small"
                  color={student.checklist_percentage >= 50 ? 'info' : 'default'}
                  variant="outlined"
                />
              </Box>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}
