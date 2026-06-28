'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Switch,
  Button,
  Skeleton,
  TextField,
  Alert,
  Snackbar,
  LinearProgress,
  alpha,
  useTheme,
} from '@neram/ui';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import GraphAvatar from '@/components/GraphAvatar';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface StudentBatch {
  id: string;
  name: string;
}

interface AccessStudent {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  ms_oid: string | null;
  nexus_access_enabled: boolean;
  batch: StudentBatch | null;
}

export default function AccessControlPage() {
  const theme = useTheme();
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [students, setStudents] = useState<AccessStudent[]>([]);
  const [batches, setBatches] = useState<StudentBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [batchFilter, setBatchFilter] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const fetchStudents = useCallback(async () => {
    if (!activeClassroom) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/students?classroom=${activeClassroom.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || []);
        if (data.batches) setBatches(data.batches);
      }
    } catch (err) {
      console.error('Failed to load students:', err);
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, getToken]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const filteredStudents = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return students.filter((s) => {
      if (batchFilter === 'unassigned' && s.batch) return false;
      if (batchFilter && batchFilter !== 'unassigned' && s.batch?.id !== batchFilter) return false;
      return (
        s.name.toLowerCase().includes(query) ||
        (s.email && s.email.toLowerCase().includes(query))
      );
    });
  }, [students, searchQuery, batchFilter]);

  const grantedCount = useMemo(
    () => students.filter((s) => s.nexus_access_enabled).length,
    [students],
  );

  const setAccess = useCallback(
    async (studentIds: string[], enabled: boolean) => {
      if (studentIds.length === 0) return;
      // Optimistic update
      setStudents((prev) =>
        prev.map((s) =>
          studentIds.includes(s.id) ? { ...s, nexus_access_enabled: enabled } : s,
        ),
      );
      setSavingIds((prev) => new Set([...prev, ...studentIds]));
      try {
        const token = await getToken();
        const res = await fetch('/api/admin/student-access', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ studentIds, enabled }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to update access');
        }
        setSnackbar(
          enabled
            ? `Opened Nexus for ${studentIds.length} student${studentIds.length > 1 ? 's' : ''}`
            : `Closed Nexus for ${studentIds.length} student${studentIds.length > 1 ? 's' : ''}`,
        );
      } catch (err) {
        // Revert on failure
        setStudents((prev) =>
          prev.map((s) =>
            studentIds.includes(s.id) ? { ...s, nexus_access_enabled: !enabled } : s,
          ),
        );
        setSnackbar(err instanceof Error ? err.message : 'Failed to update access');
      } finally {
        setSavingIds((prev) => {
          const next = new Set(prev);
          studentIds.forEach((id) => next.delete(id));
          return next;
        });
      }
    },
    [getToken],
  );

  const shownIds = filteredStudents.map((s) => s.id);
  const shownAllGranted = filteredStudents.length > 0 && filteredStudents.every((s) => s.nexus_access_enabled);

  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 0.5 }}>
        Access Control
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Nexus is closed to students by default during the rebuild. Switch a student on to let them in.
        Open access one by one, or in batches, as each part of Nexus is ready.
      </Typography>

      {!activeClassroom ? (
        <Alert severity="info">
          Select a classroom in the Management panel first. Access is managed per classroom.
        </Alert>
      ) : (
        <>
          {/* Summary */}
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              mb: 2,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              bgcolor: alpha(theme.palette.success.main, grantedCount > 0 ? 0.04 : 0),
            }}
          >
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {activeClassroom.name}
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {grantedCount} of {students.length} have access
              </Typography>
            </Box>
            <Button
              size="small"
              variant="outlined"
              color="success"
              startIcon={<LockOpenOutlinedIcon />}
              disabled={loading || filteredStudents.length === 0 || shownAllGranted}
              onClick={() => setAccess(shownIds.filter((id) => !students.find((s) => s.id === id)?.nexus_access_enabled), true)}
              sx={{ minHeight: 40, textTransform: 'none' }}
            >
              Open all shown
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              startIcon={<LockOutlinedIcon />}
              disabled={loading || grantedCount === 0}
              onClick={() => setAccess(shownIds.filter((id) => students.find((s) => s.id === id)?.nexus_access_enabled), false)}
              sx={{ minHeight: 40, textTransform: 'none' }}
            >
              Close all shown
            </Button>
          </Paper>

          {/* Search */}
          <TextField
            fullWidth
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="small"
            sx={{ mb: 1.5 }}
          />

          {/* Batch filter chips */}
          {batches.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1, mb: 2, overflowX: 'auto', pb: 0.5 }}>
              <Chip
                label="All"
                size="small"
                variant={batchFilter === null ? 'filled' : 'outlined'}
                color={batchFilter === null ? 'primary' : 'default'}
                onClick={() => setBatchFilter(null)}
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
              <Chip
                label="Unassigned"
                size="small"
                variant={batchFilter === 'unassigned' ? 'filled' : 'outlined'}
                color={batchFilter === 'unassigned' ? 'warning' : 'default'}
                onClick={() => setBatchFilter('unassigned')}
                sx={{ minHeight: 32 }}
              />
            </Box>
          )}

          {/* List */}
          {loading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} variant="rectangular" height={68} sx={{ borderRadius: 1 }} />
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
              {filteredStudents.map((student) => {
                const saving = savingIds.has(student.id);
                return (
                  <Paper
                    key={student.id}
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      borderColor: student.nexus_access_enabled
                        ? alpha(theme.palette.success.main, 0.4)
                        : undefined,
                    }}
                  >
                    {saving && <LinearProgress sx={{ mb: 1, borderRadius: 1 }} />}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <GraphAvatar msOid={student.ms_oid} name={student.name} size={40} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography variant="body1" sx={{ fontWeight: 600 }} noWrap>
                            {student.name}
                          </Typography>
                          {student.batch && (
                            <Chip
                              label={student.batch.name}
                              size="small"
                              variant="outlined"
                              sx={{ height: 20, fontSize: '0.7rem', flexShrink: 0 }}
                            />
                          )}
                        </Box>
                        {student.email && (
                          <Typography variant="body2" color="text.secondary" noWrap>
                            {student.email}
                          </Typography>
                        )}
                      </Box>
                      <Chip
                        label={student.nexus_access_enabled ? 'Active' : 'Gated'}
                        size="small"
                        color={student.nexus_access_enabled ? 'success' : 'default'}
                        variant={student.nexus_access_enabled ? 'outlined' : 'filled'}
                        sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600, flexShrink: 0 }}
                      />
                      <Switch
                        checked={student.nexus_access_enabled}
                        disabled={saving}
                        onChange={(e) => setAccess([student.id], e.target.checked)}
                        inputProps={{ 'aria-label': `Toggle Nexus access for ${student.name}` }}
                      />
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          )}
        </>
      )}

      <Snackbar
        open={!!snackbar}
        autoHideDuration={2500}
        onClose={() => setSnackbar(null)}
        message={snackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
