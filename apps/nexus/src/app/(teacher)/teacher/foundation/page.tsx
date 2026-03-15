'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Button,
  Skeleton,
  Chip,
  alpha,
  useTheme,
  Avatar,
  LinearProgress,
} from '@neram/ui';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import PageHeader from '@/components/PageHeader';

interface StudentProgress {
  student: { id: string; name: string; email: string; avatar_url: string | null };
  completed_chapters: number;
  total_chapters: number;
  current_chapter: { chapter_id: string; status: string; updated_at: string } | null;
  last_activity: string | null;
}

export default function TeacherFoundationDashboard() {
  const theme = useTheme();
  const router = useRouter();
  const { activeClassroom, getToken, loading: authLoading } = useNexusAuthContext();
  const [students, setStudents] = useState<StudentProgress[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const params = new URLSearchParams();
      if (activeClassroom) params.set('classroom', activeClassroom.id);

      const res = await fetch(`/api/foundation/dashboard?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || []);
      }
    } catch (err) {
      console.error('Failed to load foundation dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, getToken]);

  useEffect(() => {
    if (!authLoading) fetchDashboard();
  }, [authLoading, fetchDashboard]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const getStatusColor = (student: StudentProgress) => {
    if (student.completed_chapters === student.total_chapters) return theme.palette.success.main;
    if (!student.last_activity) return theme.palette.error.main;

    const daysSince = Math.floor(
      (Date.now() - new Date(student.last_activity).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSince > 3) return theme.palette.error.main;
    if (daysSince > 1) return theme.palette.warning.main;
    return theme.palette.primary.main;
  };

  // Sort: stuck students first, then by completion (ascending)
  const sortedStudents = [...students].sort((a, b) => {
    const aColor = getStatusColor(a);
    const bColor = getStatusColor(b);
    if (aColor === theme.palette.error.main && bColor !== theme.palette.error.main) return -1;
    if (bColor === theme.palette.error.main && aColor !== theme.palette.error.main) return 1;
    return a.completed_chapters - b.completed_chapters;
  });

  const completedAll = students.filter(s => s.completed_chapters === s.total_chapters).length;
  const inProgress = students.filter(s => s.completed_chapters > 0 && s.completed_chapters < s.total_chapters).length;
  const notStarted = students.filter(s => s.completed_chapters === 0).length;

  return (
    <Box>
      <PageHeader
        title="Foundation Progress"
        subtitle="Track students' self-paced learning progress"
        action={
          <Button
            variant="outlined"
            startIcon={<SettingsOutlinedIcon />}
            onClick={() => router.push('/teacher/foundation/manage')}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            Manage Content
          </Button>
        }
      />

      {/* Summary Stats */}
      {!loading && students.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
          <Chip
            label={`${completedAll} Completed`}
            size="small"
            sx={{
              bgcolor: alpha(theme.palette.success.main, 0.1),
              color: theme.palette.success.main,
              fontWeight: 700,
              fontSize: '0.75rem',
            }}
          />
          <Chip
            label={`${inProgress} In Progress`}
            size="small"
            sx={{
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              color: theme.palette.primary.main,
              fontWeight: 700,
              fontSize: '0.75rem',
            }}
          />
          <Chip
            label={`${notStarted} Not Started`}
            size="small"
            sx={{
              bgcolor: alpha(theme.palette.error.main, 0.1),
              color: theme.palette.error.main,
              fontWeight: 700,
              fontSize: '0.75rem',
            }}
          />
        </Box>
      )}

      {/* Student List */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 2.5 }} />
            ))
          : sortedStudents.length === 0 ? (
              <Paper
                elevation={0}
                sx={{
                  p: 4,
                  textAlign: 'center',
                  borderRadius: 3,
                  border: `1px solid ${theme.palette.divider}`,
                }}
              >
                <Typography variant="h6" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                  No students found
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.disabled', mt: 0.5 }}>
                  {activeClassroom
                    ? 'No students are enrolled in this classroom.'
                    : 'Select a classroom to view student progress.'}
                </Typography>
              </Paper>
            )
          : sortedStudents.map((sp, index) => {
              const pct = sp.total_chapters > 0
                ? Math.round((sp.completed_chapters / sp.total_chapters) * 100)
                : 0;
              const statusColor = getStatusColor(sp);

              return (
                <Paper
                  key={sp.student.id}
                  elevation={0}
                  sx={{
                    p: 2,
                    borderRadius: 2.5,
                    border: `1px solid ${theme.palette.divider}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    animation: `fadeIn 300ms ease ${index * 30}ms both`,
                    '@keyframes fadeIn': {
                      from: { opacity: 0, transform: 'translateY(4px)' },
                      to: { opacity: 1, transform: 'translateY(0)' },
                    },
                  }}
                >
                  {/* Avatar */}
                  <Avatar
                    src={sp.student.avatar_url || undefined}
                    sx={{
                      width: 40,
                      height: 40,
                      bgcolor: alpha(statusColor, 0.15),
                      color: statusColor,
                      fontWeight: 700,
                      fontSize: '0.85rem',
                    }}
                  >
                    {sp.student.name?.charAt(0)?.toUpperCase() || '?'}
                  </Avatar>

                  {/* Info */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, fontSize: '0.85rem' }}
                        noWrap
                      >
                        {sp.student.name}
                      </Typography>
                      <Chip
                        label={`${sp.completed_chapters}/${sp.total_chapters}`}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          bgcolor: alpha(statusColor, 0.1),
                          color: statusColor,
                        }}
                      />
                    </Box>

                    <LinearProgress
                      variant="determinate"
                      value={pct}
                      sx={{
                        height: 4,
                        borderRadius: 2,
                        bgcolor: alpha(statusColor, 0.1),
                        '& .MuiLinearProgress-bar': {
                          borderRadius: 2,
                          bgcolor: statusColor,
                        },
                      }}
                    />

                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', fontSize: '0.65rem', mt: 0.25, display: 'block' }}
                    >
                      Last active: {formatDate(sp.last_activity)}
                    </Typography>
                  </Box>
                </Paper>
              );
            })}
      </Box>
    </Box>
  );
}
