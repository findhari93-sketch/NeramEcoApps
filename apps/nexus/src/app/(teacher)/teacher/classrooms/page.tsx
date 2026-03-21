'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  Fab,
  AddIcon,
  alpha,
  useTheme,
} from '@neram/ui';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ClassroomFormDialog from '@/components/ClassroomFormDialog';

interface ClassroomSummary {
  id: string;
  name: string;
  type: string;
  short_code: string | null;
  description: string | null;
  is_active: boolean;
  studentCount: number;
  teacherCount: number;
  batchCount: number;
}

const typeLabels: Record<string, string> = {
  nata: 'NATA',
  jee: 'JEE',
  revit: 'Revit',
  common: 'Common',
  other: 'Other',
};

const typeColors: Record<string, 'primary' | 'secondary' | 'info' | 'warning' | 'default'> = {
  nata: 'primary',
  jee: 'secondary',
  revit: 'info',
  common: 'warning',
  other: 'default',
};

export default function ClassroomsPage() {
  const router = useRouter();
  const theme = useTheme();
  const { getToken } = useNexusAuthContext();
  const [classrooms, setClassrooms] = useState<ClassroomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchClassrooms = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/classrooms', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setClassrooms(data.classrooms || []);
      }
    } catch (err) {
      console.error('Failed to load classrooms:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchClassrooms();
  }, [fetchClassrooms]);

  const handleCreate = async (formData: { name: string; type: string; description: string; ms_team_id: string | null }) => {
    const token = await getToken();
    if (!token) return;

    const res = await fetch('/api/classrooms', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create classroom');
    }

    await fetchClassrooms();
  };

  return (
    <Box sx={{ maxWidth: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: { xs: 2, sm: 3 },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="h5"
            component="h1"
            sx={{
              fontWeight: 700,
              fontSize: { xs: '1.25rem', sm: '1.5rem' },
            }}
          >
            Classrooms
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontSize: { xs: '0.8rem', sm: '0.875rem' } }}
          >
            Manage your classrooms and batches
          </Typography>
        </Box>
        {/* Desktop create button */}
        <Box sx={{ display: { xs: 'none', sm: 'block' }, flexShrink: 0 }}>
          <Fab
            color="primary"
            variant="extended"
            size="medium"
            onClick={() => setCreateOpen(true)}
          >
            <AddIcon sx={{ mr: 1 }} />
            New Classroom
          </Fab>
        </Box>
      </Box>

      {/* Classroom Cards */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 1.5, sm: 2 } }}>
          {[1, 2, 3].map((i) => (
            <Skeleton
              key={i}
              variant="rectangular"
              height={100}
              sx={{ borderRadius: 2 }}
            />
          ))}
        </Box>
      ) : classrooms.length === 0 ? (
        <Paper
          sx={{
            p: { xs: 3, sm: 4 },
            textAlign: 'center',
            borderRadius: 3,
          }}
        >
          <SchoolOutlinedIcon sx={{ fontSize: { xs: 48, sm: 64 }, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No classrooms yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Create your first classroom to start managing students and batches.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 1.5, sm: 2 } }}>
          {classrooms.map((classroom) => (
            <Paper
              key={classroom.id}
              variant="outlined"
              onClick={() => router.push(`/teacher/classrooms/${classroom.id}`)}
              sx={{
                p: { xs: 2, sm: 2.5 },
                cursor: 'pointer',
                borderRadius: 2.5,
                transition: 'all 0.15s ease',
                WebkitTapHighlightColor: 'transparent',
                '&:hover': {
                  backgroundColor: 'action.hover',
                  borderColor: 'primary.main',
                },
                '&:active': {
                  backgroundColor: 'action.selected',
                  transform: 'scale(0.99)',
                },
              }}
            >
              {/* Top row: Name + Type chip */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 1,
                  mb: 0.5,
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="subtitle1"
                    sx={{
                      fontWeight: 600,
                      fontSize: { xs: '0.95rem', sm: '1rem' },
                      lineHeight: 1.3,
                      minWidth: 0,
                      wordBreak: 'break-word',
                    }}
                  >
                    {classroom.name}
                  </Typography>
                  {classroom.short_code && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 600 }}
                    >
                      {classroom.short_code}
                    </Typography>
                  )}
                </Box>
                <Chip
                  label={typeLabels[classroom.type] || classroom.type}
                  size="small"
                  color={typeColors[classroom.type] || 'default'}
                  variant="outlined"
                  sx={{ flexShrink: 0, height: 24, fontSize: '0.7rem' }}
                />
              </Box>

              {/* Description */}
              {classroom.description && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    mb: 1.5,
                    fontSize: { xs: '0.8rem', sm: '0.85rem' },
                    lineHeight: 1.4,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {classroom.description}
                </Typography>
              )}

              {/* Stats row */}
              <Box
                sx={{
                  display: 'flex',
                  gap: { xs: 1.5, sm: 2 },
                  flexWrap: 'wrap',
                  mt: classroom.description ? 0 : 1,
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    bgcolor: alpha(theme.palette.primary.main, 0.06),
                    borderRadius: 1.5,
                    px: 1,
                    py: 0.25,
                  }}
                >
                  <PeopleOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontWeight: 500, fontSize: '0.75rem' }}
                  >
                    {classroom.studentCount} student{classroom.studentCount !== 1 ? 's' : ''}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    bgcolor: alpha(theme.palette.secondary.main, 0.06),
                    borderRadius: 1.5,
                    px: 1,
                    py: 0.25,
                  }}
                >
                  <LayersOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontWeight: 500, fontSize: '0.75rem' }}
                  >
                    {classroom.batchCount} batch{classroom.batchCount !== 1 ? 'es' : ''}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      {/* Mobile FAB */}
      <Fab
        color="primary"
        onClick={() => setCreateOpen(true)}
        sx={{
          display: { xs: 'flex', sm: 'none' },
          position: 'fixed',
          bottom: 80,
          right: 16,
          zIndex: 1000,
          width: 56,
          height: 56,
        }}
      >
        <AddIcon />
      </Fab>

      <ClassroomFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        mode="create"
        getToken={getToken}
      />
    </Box>
  );
}
