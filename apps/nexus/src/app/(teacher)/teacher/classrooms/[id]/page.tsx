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
  Fab,
  AddIcon,
  EditIcon,
  DeleteIcon,
  ArrowBackIcon,
  Switch,
  CircularProgress,
} from '@neram/ui';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import GroupsIcon from '@mui/icons-material/Groups';
import SyncIcon from '@mui/icons-material/Sync';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import LinkIcon from '@mui/icons-material/Link';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import PersonRemoveOutlinedIcon from '@mui/icons-material/PersonRemoveOutlined';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import HistoryIcon from '@mui/icons-material/History';
import { Snackbar, Alert, Checkbox } from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ClassroomFormDialog from '@/components/ClassroomFormDialog';
import BatchFormDialog from '@/components/BatchFormDialog';
import BatchAssignDialog from '@/components/BatchAssignDialog';
import AddStudentDialog from '@/components/AddStudentDialog';
import RemoveStudentDialog from '@/components/RemoveStudentDialog';
import HistoricalStudentsTab from '@/components/HistoricalStudentsTab';
import GraphAvatar from '@/components/GraphAvatar';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';

interface ClassroomDetail {
  id: string;
  name: string;
  type: string;
  description: string | null;
  is_active: boolean;
  ms_team_id: string | null;
  ms_team_name: string | null;
  ms_team_sync_enabled: boolean;
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
  user: { id: string; name: string; email: string; avatar_url: string | null; ms_oid?: string | null };
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
  const [addTeacherOpen, setAddTeacherOpen] = useState(false);
  const [teacherEnrollments, setTeacherEnrollments] = useState<Enrollment[]>([]);
  const [qbEnabled, setQbEnabled] = useState<boolean | null>(null);
  const [qbToggling, setQbToggling] = useState(false);

  // Student selection & removal state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);

  // Teams integration state
  const [teamsSyncing, setTeamsSyncing] = useState(false);
  const [teamsCreating, setTeamsCreating] = useState(false);
  const [teamsLinking, setTeamsLinking] = useState(false);
  const [availableTeams, setAvailableTeams] = useState<{ id: string; displayName: string }[]>([]);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false, message: '', severity: 'success',
  });

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

  const fetchTeacherEnrollments = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/classrooms/${id}/enrollments?role=teacher`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setTeacherEnrollments(data.enrollments || []);
      }
    } catch (err) {
      console.error('Failed to load teacher enrollments:', err);
    }
  }, [id, getToken]);

  const fetchQBStatus = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/question-bank/classroom-link?classroom_id=${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setQbEnabled(json.data?.enabled === true);
      }
    } catch (err) {
      console.error('Failed to fetch QB status:', err);
    }
  }, [id, getToken]);

  const handleQBToggle = async () => {
    setQbToggling(true);
    try {
      const token = await getToken();
      if (!token) return;
      const newEnabled = !qbEnabled;
      const res = await fetch('/api/question-bank/classroom-link', {
        method: newEnabled ? 'POST' : 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ classroom_id: id }),
      });
      if (res.ok) {
        setQbEnabled(newEnabled);
      }
    } catch (err) {
      console.error('Failed to toggle QB:', err);
    } finally {
      setQbToggling(false);
    }
  };

  // Teams: Sync members
  const handleTeamsSync = async () => {
    setTeamsSyncing(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/classrooms/${id}/teams-sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        const r = data.result;
        setSnackbar({
          open: true,
          severity: 'success',
          message: `Sync complete: ${r.added} added, ${r.alreadyInTeam} already in team${r.skipped ? `, ${r.skipped} skipped (no Microsoft account)` : ''}`,
        });
      } else {
        setSnackbar({ open: true, severity: 'error', message: data.error || 'Sync failed' });
      }
    } catch {
      setSnackbar({ open: true, severity: 'error', message: 'Teams sync failed' });
    } finally {
      setTeamsSyncing(false);
    }
  };

  // Teams: Create new team
  const handleTeamsCreate = async () => {
    setTeamsCreating(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/classrooms/${id}/teams-create`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setSnackbar({ open: true, severity: 'success', message: `Team "${data.teamName}" created and linked!` });
        await fetchClassroom();
      } else {
        setSnackbar({ open: true, severity: 'error', message: data.error || 'Failed to create team' });
      }
    } catch {
      setSnackbar({ open: true, severity: 'error', message: 'Failed to create team' });
    } finally {
      setTeamsCreating(false);
    }
  };

  // Teams: Link existing team
  const handleTeamsLink = async (teamId: string, teamName: string) => {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`/api/classrooms/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ms_team_id: teamId, ms_team_name: teamName }),
    });
    if (res.ok) {
      setSnackbar({ open: true, severity: 'success', message: `Linked to "${teamName}"` });
      setTeamsLinking(false);
      await fetchClassroom();
    }
  };

  // Teams: Unlink team
  const handleTeamsUnlink = async () => {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`/api/classrooms/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ms_team_id: null, ms_team_name: null, ms_team_sync_enabled: false }),
    });
    if (res.ok) {
      setSnackbar({ open: true, severity: 'info', message: 'Team unlinked' });
      await fetchClassroom();
    }
  };

  // Teams: Toggle auto-sync
  const handleTeamsAutoSyncToggle = async () => {
    const token = await getToken();
    if (!token || !classroom) return;
    const newValue = !classroom.ms_team_sync_enabled;
    const res = await fetch(`/api/classrooms/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ms_team_sync_enabled: newValue }),
    });
    if (res.ok) {
      await fetchClassroom();
    }
  };

  // Teams: Fetch available teams for linking
  const handleFetchTeams = async () => {
    setTeamsLinking(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/classrooms/teams-teams', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableTeams(data.teams || []);
      }
    } catch {
      setSnackbar({ open: true, severity: 'error', message: 'Failed to load Teams teams' });
    }
  };

  useEffect(() => {
    fetchClassroom();
    fetchQBStatus();
  }, [fetchClassroom, fetchQBStatus]);

  useEffect(() => {
    if (tab === 2) fetchTeacherEnrollments();
    if (tab === 3) fetchEnrollments();
  }, [tab, fetchEnrollments, fetchTeacherEnrollments]);

  const handleEditClassroom = async (formData: { name: string; type: string; description: string; ms_team_id: string | null }) => {
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
        <Tab label="Teachers" sx={{ minHeight: 48 }} />
        <Tab label="Students" sx={{ minHeight: 48 }} />
        <Tab label="History" sx={{ minHeight: 48 }} icon={<HistoryIcon sx={{ fontSize: 18 }} />} iconPosition="start" />
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
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">Question Bank</Typography>
                {qbToggling ? (
                  <CircularProgress size={20} />
                ) : (
                  <Switch
                    checked={qbEnabled === true}
                    onChange={handleQBToggle}
                    disabled={qbEnabled === null}
                    size="small"
                  />
                )}
              </Box>
            </Box>
          </Paper>

          {/* Teams Integration Panel */}
          <Paper variant="outlined" sx={{ p: 2.5, mt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <GroupsIcon color="primary" />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Microsoft Teams
              </Typography>
            </Box>

            {classroom.ms_team_id ? (
              /* Team is linked */
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip
                    label={classroom.ms_team_name || 'Linked Team'}
                    color="primary"
                    variant="outlined"
                    size="small"
                  />
                  <Typography variant="caption" color="text.secondary">
                    Linked
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>Auto-sync</Typography>
                    <Typography variant="caption" color="text.secondary">
                      New students auto-added to Teams
                    </Typography>
                  </Box>
                  <Switch
                    checked={classroom.ms_team_sync_enabled}
                    onChange={handleTeamsAutoSyncToggle}
                    size="small"
                  />
                </Box>

                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={teamsSyncing ? <CircularProgress size={16} /> : <SyncIcon />}
                    onClick={handleTeamsSync}
                    disabled={teamsSyncing}
                    sx={{ textTransform: 'none' }}
                  >
                    {teamsSyncing ? 'Syncing...' : 'Sync Now'}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<LinkOffIcon />}
                    onClick={handleTeamsUnlink}
                    sx={{ textTransform: 'none' }}
                  >
                    Unlink
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<OpenInNewIcon />}
                    href={`https://teams.microsoft.com/l/team/${classroom.ms_team_id}`}
                    target="_blank"
                    sx={{ textTransform: 'none' }}
                  >
                    Open in Teams
                  </Button>
                </Box>
              </Box>
            ) : (
              /* No team linked */
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Typography variant="body2" color="text.secondary">
                  No team linked. Link a team to enable auto-sync and channel meetings.
                </Typography>

                {teamsLinking ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {availableTeams.length === 0 ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={20} />
                        <Typography variant="body2">Loading your teams...</Typography>
                      </Box>
                    ) : (
                      <>
                        <Typography variant="caption" color="text.secondary">
                          Select a team to link:
                        </Typography>
                        {availableTeams.map((team) => (
                          <Paper
                            key={team.id}
                            variant="outlined"
                            onClick={() => handleTeamsLink(team.id, team.displayName)}
                            sx={{
                              p: 1.5,
                              cursor: 'pointer',
                              '&:hover': { bgcolor: 'action.hover', borderColor: 'primary.main' },
                              transition: 'all 0.15s',
                            }}
                          >
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {team.displayName}
                            </Typography>
                          </Paper>
                        ))}
                        <Button size="small" onClick={() => setTeamsLinking(false)} sx={{ textTransform: 'none' }}>
                          Cancel
                        </Button>
                      </>
                    )}
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<LinkIcon />}
                      onClick={handleFetchTeams}
                      sx={{ textTransform: 'none' }}
                    >
                      Link Existing Team
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={teamsCreating ? <CircularProgress size={16} /> : <AddCircleOutlineIcon />}
                      onClick={handleTeamsCreate}
                      disabled={teamsCreating}
                      sx={{ textTransform: 'none' }}
                    >
                      {teamsCreating ? 'Creating...' : 'Create New Team'}
                    </Button>
                  </Box>
                )}
              </Box>
            )}
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

      {/* Tab: Teachers */}
      {tab === 2 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="contained"
              size="small"
              startIcon={<PersonAddAltOutlinedIcon />}
              onClick={() => setAddTeacherOpen(true)}
            >
              Add Teacher
            </Button>
          </Box>

          {teacherEnrollments.length === 0 ? (
            <Paper sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                No teachers assigned to this classroom.
              </Typography>
            </Paper>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {teacherEnrollments.map((enrollment) => (
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
      )}

      {/* Tab: Students */}
      {tab === 3 && (
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
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 2, flexWrap: 'wrap' }}>
            {selectionMode ? (
              <>
                <Button
                  size="small"
                  onClick={() => {
                    if (selectedIds.size === enrollments.length) {
                      setSelectedIds(new Set());
                    } else {
                      setSelectedIds(new Set(enrollments.map((e) => e.id)));
                    }
                  }}
                >
                  {selectedIds.size === enrollments.length ? 'Deselect All' : 'Select All'}
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  color="error"
                  startIcon={<PersonRemoveOutlinedIcon />}
                  onClick={() => setRemoveDialogOpen(true)}
                  disabled={selectedIds.size === 0}
                >
                  Remove ({selectedIds.size})
                </Button>
                <Button
                  size="small"
                  onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
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
                {enrollments.length > 0 && (
                  <Button
                    variant="outlined"
                    size="small"
                    color="error"
                    startIcon={<PersonRemoveOutlinedIcon />}
                    onClick={() => setSelectionMode(true)}
                  >
                    Remove
                  </Button>
                )}
              </>
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
                  onClick={selectionMode ? () => {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(enrollment.id)) next.delete(enrollment.id);
                      else next.add(enrollment.id);
                      return next;
                    });
                  } : undefined}
                  sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    minHeight: 48,
                    cursor: selectionMode ? 'pointer' : 'default',
                    ...(selectionMode && selectedIds.has(enrollment.id) && {
                      borderColor: 'error.main',
                      bgcolor: 'error.50',
                    }),
                  }}
                >
                  {selectionMode && (
                    <Checkbox
                      checked={selectedIds.has(enrollment.id)}
                      size="small"
                      color="error"
                      sx={{ p: 0.5 }}
                    />
                  )}
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
          {!selectionMode && enrollments.length > 0 && batches.length > 0 && (
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

          {/* Mobile fixed bottom bar for selection mode */}
          {selectionMode && selectedIds.size > 0 && (
            <Box
              sx={{
                display: { xs: 'flex', sm: 'none' },
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                p: 2,
                bgcolor: 'background.paper',
                borderTop: '1px solid',
                borderColor: 'divider',
                zIndex: 1000,
                gap: 1,
                justifyContent: 'center',
              }}
            >
              <Button
                variant="contained"
                color="error"
                startIcon={<PersonRemoveOutlinedIcon />}
                onClick={() => setRemoveDialogOpen(true)}
                fullWidth
              >
                Remove {selectedIds.size} Student{selectedIds.size !== 1 ? 's' : ''}
              </Button>
            </Box>
          )}
        </Box>
      )}

      {/* Tab: History */}
      {tab === 4 && (
        <HistoricalStudentsTab
          classroomId={id}
          getToken={getToken}
          onRestored={() => {
            fetchClassroom();
            fetchEnrollments();
          }}
        />
      )}

      {/* Dialogs */}
      <ClassroomFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSubmit={handleEditClassroom}
        initialData={classroom}
        mode="edit"
        getToken={getToken}
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

      <RemoveStudentDialog
        open={removeDialogOpen}
        onClose={() => setRemoveDialogOpen(false)}
        students={enrollments
          .filter((e) => selectedIds.has(e.id))
          .map((e) => ({
            enrollmentId: e.id,
            name: e.user.name,
            email: e.user.email,
            avatar_url: e.user.avatar_url,
          }))}
        classroomId={id}
        onRemoved={() => {
          setSelectionMode(false);
          setSelectedIds(new Set());
          fetchClassroom();
          fetchEnrollments();
        }}
        getToken={getToken}
      />

      <AddStudentDialog
        open={addStudentOpen}
        onClose={() => setAddStudentOpen(false)}
        classroomId={id}
        batches={batches.map((b) => ({ id: b.id, name: b.name }))}
        defaultRole="student"
        onStudentsAdded={() => {
          fetchClassroom();
          if (tab === 3) fetchEnrollments();
        }}
      />

      <AddStudentDialog
        open={addTeacherOpen}
        onClose={() => setAddTeacherOpen(false)}
        classroomId={id}
        batches={batches.map((b) => ({ id: b.id, name: b.name }))}
        defaultRole="teacher"
        onStudentsAdded={() => {
          fetchClassroom();
          if (tab === 2) fetchTeacherEnrollments();
        }}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
