'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  TextField,
  MenuItem,
  Avatar,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Alert,
  Checkbox,
  Tooltip,
  IconButton,
} from '@neram/ui';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import RestoreIcon from '@mui/icons-material/Restore';
import { useAdminProfile } from '@/contexts/AdminProfileContext';
import GraduateBatchDialog from '../../../components/crm/GraduateBatchDialog';

interface AlumniRow {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  academic_year: string | null;
  alumni_since: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function AlumniPage() {
  const router = useRouter();
  const { supabaseUserId } = useAdminProfile();

  const [alumni, setAlumni] = useState<AlumniRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [graduateOpen, setGraduateOpen] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [restoring, setRestoring] = useState(false);

  const loadAlumni = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (yearFilter) params.set('academicYear', yearFilter);
      const res = await fetch(`/api/crm/alumni?${params}`);
      const data = await res.json();
      setAlumni(data.alumni || []);
      setSelected(new Set());
    } catch {
      setBanner({ type: 'error', text: 'Failed to load alumni' });
    } finally {
      setLoading(false);
    }
  }, [search, yearFilter]);

  useEffect(() => {
    const t = setTimeout(loadAlumni, 250);
    return () => clearTimeout(t);
  }, [loadAlumni]);

  // Distinct cohort years for the filter dropdown.
  const cohortYears = useMemo(() => {
    const set = new Set<string>();
    for (const a of alumni) if (a.academic_year) set.add(a.academic_year);
    return Array.from(set).sort().reverse();
  }, [alumni]);

  const allSelected = alumni.length > 0 && selected.size === alumni.length;
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(alumni.map((a) => a.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGraduate = useCallback(
    async (userIds: string[], academicYear: string, reason: string) => {
      if (!supabaseUserId) throw new Error('Admin session not ready, try again in a moment.');
      const res = await fetch('/api/crm/alumni/graduate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds, academicYear, reason, adminId: supabaseUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to graduate batch');
      setGraduateOpen(false);
      setBanner({
        type: 'success',
        text: `Graduated ${data.graduated} student(s) to alumni (${academicYear}). ${data.enrollmentsDeactivated} enrollment(s) deactivated.`,
      });
      loadAlumni();
    },
    [supabaseUserId, loadAlumni],
  );

  const handleRestore = useCallback(
    async (userIds: string[]) => {
      if (!supabaseUserId || userIds.length === 0) return;
      setRestoring(true);
      try {
        const res = await fetch('/api/crm/alumni/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds, adminId: supabaseUserId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to restore');
        setBanner({ type: 'success', text: `Restored ${data.restored} alumnus/alumni to active.` });
        loadAlumni();
      } catch (err: any) {
        setBanner({ type: 'error', text: err?.message || 'Failed to restore' });
      } finally {
        setRestoring(false);
      }
    },
    [supabaseUserId, loadAlumni],
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          mb: 3,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <HistoryEduIcon sx={{ color: '#B45309', fontSize: 30 }} />
          <Box>
            <Typography variant="h5" fontWeight={800}>
              Alumni
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Past students whose Nexus access has ended. Reversible.
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<EmojiEventsOutlinedIcon />}
            onClick={() => router.push('/alumni/gallery')}
            sx={{ textTransform: 'none' }}
          >
            Hall of Fame
          </Button>
          <Button
            variant="contained"
            color="warning"
            startIcon={<HistoryEduIcon />}
            onClick={() => setGraduateOpen(true)}
            sx={{ textTransform: 'none' }}
          >
            Graduate Batch
          </Button>
        </Box>
      </Box>

      {banner && (
        <Alert severity={banner.type} sx={{ mb: 2 }} onClose={() => setBanner(null)}>
          {banner.text}
        </Alert>
      )}

      {/* Filters */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 240 }}
        />
        <TextField
          select
          size="small"
          label="Cohort year"
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All years</MenuItem>
          {cohortYears.map((y) => (
            <MenuItem key={y} value={y}>
              {y}
            </MenuItem>
          ))}
        </TextField>
        {selected.size > 0 && (
          <Button
            variant="outlined"
            startIcon={restoring ? <CircularProgress size={16} /> : <RestoreIcon />}
            disabled={restoring}
            onClick={() => handleRestore(Array.from(selected))}
            sx={{ textTransform: 'none' }}
          >
            Restore {selected.size}
          </Button>
        )}
      </Box>

      {/* Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : alumni.length === 0 ? (
        <Paper variant="outlined" sx={{ textAlign: 'center', py: 8, borderRadius: 2 }}>
          <HistoryEduIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">No alumni yet.</Typography>
          <Typography variant="body2" color="text.secondary">
            Use &quot;Graduate Batch&quot; to move a finished cohort here.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox size="small" checked={allSelected} onChange={toggleAll} />
                </TableCell>
                <TableCell>Student</TableCell>
                <TableCell>Cohort</TableCell>
                <TableCell>Alumni since</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {alumni.map((a) => (
                <TableRow key={a.id} hover selected={selected.has(a.id)}>
                  <TableCell padding="checkbox">
                    <Checkbox size="small" checked={selected.has(a.id)} onChange={() => toggleOne(a.id)} />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar src={a.avatar_url || undefined} sx={{ width: 32, height: 32, fontSize: 13 }}>
                        {a.name?.charAt(0)?.toUpperCase() || '?'}
                      </Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={500} noWrap>
                          {a.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {a.email || 'No email'}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    {a.academic_year ? (
                      <Chip
                        label={a.academic_year}
                        size="small"
                        sx={{ height: 22, fontSize: 11, bgcolor: 'rgba(217,119,6,0.12)', color: '#B45309', fontWeight: 600 }}
                      />
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        Not set
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {formatDate(a.alumni_since)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Restore to active (re-enable Nexus access)">
                      <IconButton size="small" disabled={restoring} onClick={() => handleRestore([a.id])}>
                        <RestoreIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <GraduateBatchDialog open={graduateOpen} onClose={() => setGraduateOpen(false)} onConfirm={handleGraduate} />
    </Box>
  );
}
