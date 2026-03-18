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
  other: 'Other',
};

const typeColors: Record<string, 'primary' | 'secondary' | 'info' | 'default'> = {
  nata: 'primary',
  jee: 'secondary',
  revit: 'info',
  other: 'default',
};

export default function ClassroomsPage() {
  const router = useRouter();
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
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            Classrooms
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage your classrooms and batches
          </Typography>
        </Box>
        {/* Desktop create button */}
        <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
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
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : classrooms.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <SchoolOutlinedIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No classrooms yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Create your first classroom to start managing students and batches.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {classrooms.map((classroom) => (
            <Paper
              key={classroom.id}
              variant="outlined"
              onClick={() => router.push(`/teacher/classrooms/${classroom.id}`)}
              sx={{
                p: 2.5,
                cursor: 'pointer',
                transition: 'all 0.15s',
                '&:hover': { backgroundColor: 'action.hover', borderColor: 'primary.main' },
                '&:active': { backgroundColor: 'action.selected' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.5 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600 }} noWrap>
                    {classroom.name}
                  </Typography>
                  {classroom.description && (
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {classroom.description}
                    </Typography>
                  )}
                </Box>
                <Chip
                  label={typeLabels[classroom.type] || classroom.type}
                  size="small"
                  color={typeColors[classroom.type] || 'default'}
                  variant="outlined"
                  sx={{ ml: 1, flexShrink: 0 }}
                />
              </Box>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <PeopleOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary">
                    {classroom.studentCount} student{classroom.studentCount !== 1 ? 's' : ''}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <LayersOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary">
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
