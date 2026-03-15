'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  Tabs,
  Tab,
  Button,
  IconButton,
  Avatar,
  Fab,
  AddIcon,
  EditIcon,
  DeleteIcon,
  ArrowBackIcon,
} from '@neram/ui';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ClassroomFormDialog from '@/components/ClassroomFormDialog';
import BatchFormDialog from '@/components/BatchFormDialog';
import BatchAssignDialog from '@/components/BatchAssignDialog';
import AddStudentDialog from '@/components/AddStudentDialog';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';

interface ClassroomDetail {
  id: string;
  name: string;
  type: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

interface BatchWithCount {
  id: string;
  classroom_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  studentCount: number;
}

interface Enrollment {
  id: string;
  user_id: string;
  role: string;
  batch_id: string | null;
  user: { id: string; name: string; email: string; avatar_url: string | null };
  batch: { id: string; name: string } | null;
}

const typeLabels: Record<string, string> = {
  nata: 'NATA',
  jee: 'JEE',
  revit: 'Revit',
  other: 'Other',
};

export default function ClassroomDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();

  const [classroom, setClassroom] = useState<ClassroomDetail | null>(null);
  const [batches, setBatches] = useState<BatchWithCount[]>([]);
  const [stats, setStats] = useState({ totalStudents: 0, totalTeachers: 0, unassignedCount: 0 });
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);

  const [editOpen, setEditOpen] = useState(false);
  const [batchFormOpen, setBatchFormOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<BatchWithCount | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [batchFilter, setBatchFilter] = useState<string | null>(null);
  const [addStudentOpen, setAddStudentOpen] = useState(false);

  const fetchClassroom = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/classrooms/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setClassroom(data.classroom);
        setBatches(data.batches || []);
        setStats(data.stats || { totalStudents: 0, totalTeachers: 0, unassignedCount: 0 });
      }
    } catch (err) {
      console.error('Failed to load classroom:', err);
    } finally {
      setLoading(false);
    }
  }, [id, getToken]);

  const fetchEnrollments = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;

      let url = `/api/classrooms/${id}/enrollments?role=student`;
      if (batchFilter) url += `&batch=${batchFilter}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setEnrollments(data.enrollments || []);
      }
    } catch (err) {
      console.error('Failed to load enrollments:', err);
    }
  }, [id, batchFilter, getToken]);

  useEffect(() => {
    fetchClassroom();
  }, [fetchClassroom]);

  useEffect(() => {
    if (tab === 2) fetchEnrollments();
  }, [tab, fetchEnrollments]);

  const handleEditClassroom = async (formData: { name: string; type: string; description: string }) => {
    const token = await getToken();
    if (!token) return;

    const res = await fetch(`/api/classrooms/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    if (!res.ok) throw new Error('Failed to update');
    await fetchClassroom();
  };

  const handleCreateBatch = async (data: { name: string; description: string }) => {
    const token = await getToken();
    if (!token) return;

    const res = await fetch(`/api/classrooms/${id}/batches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create batch');
    }
    await fetchClassroom();
  };

  const handleEditBatch = async (data: { name: string; description: string }) => {
    if (!editingBatch) return;
    const token = await getToken();
    if (!token) return;

    const res = await fetch(`/api/classrooms/${id}/batches/${editingBatch.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update batch');
    }
    setEditingBatch(null);
    await fetchClassroom();
  };

  const handleDeleteBatch = async (batchId: string) => {
    const token = await getToken();
    if (!token) return;

    await fetch(`/api/classrooms/${id}/batches/${batchId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    await fetchClassroom();
  };

  const handleAssign = async (enrollmentIds: string[], batchId: string | null) => {
    const token = await getToken();
    if (!token) return;

    await fetch(`/api/classrooms/${id}/enrollments`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollment_ids: enrollmentIds, batch_id: batchId }),
    });

    await Promise.all([fetchClassroom(), fetchEnrollments()]);
  };

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={40} width={200} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2, mb: 2 }} />
        <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 2 }} />
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
        <IconButton onClick={() => router.push('/teacher/classrooms')} size="small">
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
        <IconButton onClick={() => setEditOpen(true)}>
          <EditIcon />
        </IconButton>
      </Box>

      {/* Stats row */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Paper variant="outlined" sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <PeopleOutlinedIcon color="primary" fontSize="small" />
          <Typography variant="body2">
            <strong>{stats.totalStudents}</strong> students
          </Typography>
        </Paper>
        <Paper variant="outlined" sx={{ px: 2, py: 1 }}>
          <Typography variant="body2">
            <strong>{batches.length}</strong> batches
          </Typography>
        </Paper>
        {stats.unassignedCount > 0 && (
          <Paper variant="outlined" sx={{ px: 2, py: 1 }}>
            <Typography variant="body2" color="warning.main">
              <strong>{stats.unassignedCount}</strong> unassigned
            </Typography>
          </Paper>
        )}
      </Box>

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="Overview" sx={{ minHeight: 48 }} />
        <Tab label="Batches" sx={{ minHeight: 48 }} />
        <Tab label="Students" sx={{ minHeight: 48 }} />
      </Tabs>

      {/* Tab: Overview */}
      {tab === 0 && (
        <Box>
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Classroom Details
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Name</Typography>
                <Typography variant="body2">{classroom.name}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Type</Typography>
                <Typography variant="body2">{typeLabels[classroom.type]}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Created</Typography>
                <Typography variant="body2">
                  {new Date(classroom.created_at).toLocaleDateString()}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Status</Typography>
                <Chip
                  label={classroom.is_active ? 'Active' : 'Inactive'}
                  size="small"
                  color={classroom.is_active ? 'success' : 'default'}
                />
              </Box>
            </Box>
          </Paper>
        </Box>
      )}

      {/* Tab: Batches */}
      {tab === 1 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => { setEditingBatch(null); setBatchFormOpen(true); }}
            >
              New Batch
            </Button>
          </Box>

          {batches.length === 0 ? (
            <Paper sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                No batches yet. Create one to start organizing students.
              </Typography>
            </Paper>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {batches.map((batch) => (
                <Paper
                  key={batch.id}
                  variant="outlined"
                  sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      {batch.name}
                    </Typography>
                    {batch.description && (
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {batch.description}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      {batch.studentCount} student{batch.studentCount !== 1 ? 's' : ''}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={() => { setEditingBatch(batch); setBatchFormOpen(true); }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => {
                      if (confirm(`Delete batch "${batch.name}"? Students will become unassigned.`)) {
                        handleDeleteBatch(batch.id);
                      }
                    }}
                    color="error"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Paper>
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* Tab: Students */}
      {tab === 2 && (
        <Box>
          {/* Batch filter chips */}
          <Box sx={{ display: 'flex', gap: 1, mb: 2, overflowX: 'auto', pb: 1 }}>
            <Chip
              label="All"
              size="small"
              variant={batchFilter === null ? 'filled' : 'outlined'}
              color={batchFilter === null ? 'primary' : 'default'}
              onClick={() => setBatchFilter(null)}
              sx={{ minHeight: 32 }}
            />
            <Chip
              label="Unassigned"
              size="small"
              variant={batchFilter === 'unassigned' ? 'filled' : 'outlined'}
              color={batchFilter === 'unassigned' ? 'warning' : 'default'}
              onClick={() => setBatchFilter('unassigned')}
              sx={{ minHeight: 32 }}
            />
            {batches.map((b) => (
              <Chip
                key={b.id}
                label={b.name}
                size="small"
                variant={batchFilter === b.id ? 'filled' : 'outlined'}
                color={batchFilter === b.id ? 'primary' : 'default'}
                onClick={() => setBatchFilter(b.id)}
                sx={{ minHeight: 32 }}
              />
            ))}
          </Box>

          {/* Action buttons */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 2 }}>
            <Button
              variant="contained"
              size="small"
              startIcon={<PersonAddAltOutlinedIcon />}
              onClick={() => setAddStudentOpen(true)}
            >
              Add Student
            </Button>
            {enrollments.length > 0 && batches.length > 0 && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<SwapHorizIcon />}
                onClick={() => setAssignOpen(true)}
              >
                Assign to Batch
              </Button>
            )}
          </Box>

          {/* Student list */}
          {enrollments.length === 0 ? (
            <Paper sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {batchFilter ? 'No students in this batch.' : 'No students enrolled.'}
              </Typography>
            </Paper>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {enrollments.map((enrollment) => (
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
                  <Avatar
                    src={enrollment.user.avatar_url || undefined}
                    sx={{ width: 40, height: 40 }}
                  >
                    {getInitials(enrollment.user.name)}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {enrollment.user.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {enrollment.user.email}
                    </Typography>
                  </Box>
                  {enrollment.batch ? (
                    <Chip label={enrollment.batch.name} size="small" variant="outlined" />
                  ) : (
                    <Chip label="Unassigned" size="small" color="warning" variant="outlined" />
                  )}
                </Paper>
              ))}
            </Box>
          )}

          {/* Mobile FAB for batch assignment */}
          {enrollments.length > 0 && batches.length > 0 && (
            <Fab
              color="primary"
              onClick={() => setAssignOpen(true)}
              sx={{
                display: { xs: 'flex', sm: 'none' },
                position: 'fixed',
                bottom: 80,
                right: 16,
                zIndex: 1000,
              }}
            >
              <SwapHorizIcon />
            </Fab>
          )}
        </Box>
      )}

      {/* Dialogs */}
      <ClassroomFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSubmit={handleEditClassroom}
        initialData={classroom}
        mode="edit"
      />

      <BatchFormDialog
        open={batchFormOpen}
        onClose={() => { setBatchFormOpen(false); setEditingBatch(null); }}
        onSubmit={editingBatch ? handleEditBatch : handleCreateBatch}
        initialData={editingBatch || undefined}
        mode={editingBatch ? 'edit' : 'create'}
      />

      <BatchAssignDialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        students={enrollments.map((e) => ({
          enrollmentId: e.id,
          userId: e.user_id,
          name: e.user.name,
          email: e.user.email,
          avatar_url: e.user.avatar_url,
          currentBatch: e.batch,
        }))}
        batches={batches.map((b) => ({ id: b.id, name: b.name }))}
        onAssign={handleAssign}
      />

      <AddStudentDialog
        open={addStudentOpen}
        onClose={() => setAddStudentOpen(false)}
        classroomId={id}
        batches={batches.map((b) => ({ id: b.id, name: b.name }))}
        onStudentsAdded={() => {
          fetchClassroom();
          if (tab === 2) fetchEnrollments();
        }}
      />
    </Box>
  );
}
