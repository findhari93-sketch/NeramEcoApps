'use client';

/**
 * Teacher per-file completion dashboard: every student in the classroom with their status on this
 * study file (Not opened / Studying / Completed), score, time spent and days since starting.
 * Filter by status, search by name, multi-select and message students. Desktop table + mobile cards.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box, Typography, Card, Button, IconButton, TextField, InputAdornment, Chip, Avatar, Skeleton,
  Alert, Checkbox, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel,
  ToggleButton, ToggleButtonGroup, Paper, EmptyState, alpha, useTheme, useMediaQuery,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import StudyNudgeDialog from '@/components/study-materials/StudyNudgeDialog';

type Status = 'not_opened' | 'studying' | 'completed';

interface Row {
  student_id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  status: Status;
  active_seconds: number;
  best_score_pct: number | null;
  days_since_started: number | null;
}

interface CompletionData {
  file: { id: string; title: string; has_test: boolean };
  students: Row[];
  stats: { total: number; completed: number; studying: number; not_opened: number; avg_score: number | null };
}

const STATUS_META: Record<Status, { label: string; icon: any; color: string }> = {
  completed: { label: 'Completed', icon: CheckCircleIcon, color: 'success' },
  studying: { label: 'Studying', icon: AutoStoriesOutlinedIcon, color: 'warning' },
  not_opened: { label: 'Not opened', icon: RadioButtonUncheckedIcon, color: 'default' },
};
const STATUS_ORDER: Record<Status, number> = { not_opened: 0, studying: 1, completed: 2 };

function fmtTime(sec: number): string {
  if (!sec) return '-';
  const m = Math.round(sec / 60);
  if (m < 1) return '<1m';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

type SortKey = 'name' | 'status' | 'score' | 'time' | 'days';

export default function CompletionDashboardPage() {
  const theme = useTheme();
  const router = useRouter();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { fileId } = useParams<{ fileId: string }>();
  const { getToken, activeClassroom, isTeacher, loading: authLoading } = useNexusAuthContext();

  const [data, setData] = useState<CompletionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'status', dir: 'asc' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [nudgeOpen, setNudgeOpen] = useState(false);

  const load = useCallback(async () => {
    if (!activeClassroom) return;
    setLoading(true);
    setError(null);
    try {
      const t = await getToken();
      const res = await fetch(`/api/study-materials/files/${fileId}/completion?classroom=${activeClassroom.id}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to load');
      setData(body);
    } catch (e: any) {
      setError(e?.message || 'Failed to load completion');
    } finally {
      setLoading(false);
    }
  }, [fileId, activeClassroom, getToken]);

  useEffect(() => {
    if (!authLoading && activeClassroom) load();
  }, [authLoading, activeClassroom, load]);

  const rows = useMemo(() => {
    let list = data?.students || [];
    if (statusFilter !== 'all') list = list.filter((s) => s.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((s) => (s.name || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q));
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sort.key) {
        case 'name': return dir * (a.name || '').localeCompare(b.name || '');
        case 'status': return dir * (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
        case 'score': return dir * ((a.best_score_pct ?? -1) - (b.best_score_pct ?? -1));
        case 'time': return dir * (a.active_seconds - b.active_seconds);
        case 'days': return dir * ((a.days_since_started ?? -1) - (b.days_since_started ?? -1));
        default: return 0;
      }
    });
  }, [data, statusFilter, search, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const allVisibleSelected = rows.length > 0 && rows.every((r) => selected.has(r.student_id));
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) rows.forEach((r) => next.delete(r.student_id));
      else rows.forEach((r) => next.add(r.student_id));
      return next;
    });

  const selectedRecipients = (data?.students || [])
    .filter((s) => selected.has(s.student_id))
    .map((s) => ({ id: s.student_id, name: s.name }));

  const StatusChip = ({ status }: { status: Status }) => {
    const m = STATUS_META[status];
    const Icon = m.icon;
    return (
      <Chip
        size="small"
        icon={<Icon sx={{ fontSize: '0.85rem !important' }} />}
        label={m.label}
        sx={{
          height: 22, fontSize: '0.65rem', fontWeight: 600,
          bgcolor: m.color === 'default' ? alpha(theme.palette.text.secondary, 0.1) : alpha((theme.palette as any)[m.color].main, 0.14),
          color: m.color === 'default' ? 'text.secondary' : `${m.color}.main`,
        }}
      />
    );
  };

  if (!authLoading && !isTeacher) {
    return <Box sx={{ p: 3 }}><Alert severity="error">This page is for teachers only.</Alert></Box>;
  }

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2 }, maxWidth: 1100, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton onClick={() => router.push('/teacher/study-materials')} aria-label="Back"><ArrowBackIcon /></IconButton>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" fontWeight={800} noWrap>{data?.file.title || 'Completion'}</Typography>
          <Typography variant="caption" color="text.secondary">Chapter completion</Typography>
        </Box>
      </Box>

      {data && !data.file.has_test && (
        <Alert severity="warning" icon={<ErrorOutlineIcon />} sx={{ mb: 2 }}>
          No test attached, students cannot complete this chapter until you add one.
        </Alert>
      )}

      {/* Stat tiles */}
      {loading ? (
        <Skeleton variant="rounded" height={72} sx={{ mb: 2 }} />
      ) : data ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1, mb: 2 }}>
          {[
            { label: 'Completed', value: data.stats.completed, color: theme.palette.success.main },
            { label: 'Studying', value: data.stats.studying, color: theme.palette.warning.main },
            { label: 'Not opened', value: data.stats.not_opened, color: theme.palette.text.secondary },
            { label: 'Avg score', value: data.stats.avg_score != null ? `${data.stats.avg_score}%` : '-', color: theme.palette.primary.main },
          ].map((t) => (
            <Card key={t.label} elevation={0} sx={{ p: 1.5, border: `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
              <Typography variant="h5" fontWeight={800} sx={{ color: t.color }}>{t.value}</Typography>
              <Typography variant="caption" color="text.secondary">{t.label}</Typography>
            </Card>
          ))}
        </Box>
      ) : null}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Controls */}
      <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small" placeholder="Search students..." value={search} onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1, minWidth: 180 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <ToggleButtonGroup
          value={statusFilter} exclusive size="small" onChange={(_, v) => v && setStatusFilter(v)}
          sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 1.25, minHeight: 40 } }}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="completed">Done</ToggleButton>
          <ToggleButton value="studying">Studying</ToggleButton>
          <ToggleButton value="not_opened">Not opened</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Selection action bar */}
      {selected.size > 0 && (
        <Paper elevation={0} sx={{ p: 1, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1, border: `1px solid ${theme.palette.primary.main}`, borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, 0.06) }}>
          <Typography variant="body2" fontWeight={700} sx={{ flex: 1 }}>{selected.size} selected</Typography>
          <Button size="small" onClick={() => setSelected(new Set())} sx={{ textTransform: 'none' }}>Clear</Button>
          <Button size="small" variant="contained" startIcon={<SendIcon />} onClick={() => setNudgeOpen(true)} sx={{ textTransform: 'none' }}>
            Message
          </Button>
        </Paper>
      )}

      {/* List */}
      {loading ? (
        <Skeleton variant="rounded" height={300} />
      ) : rows.length === 0 ? (
        <EmptyState title="No students" description={search || statusFilter !== 'all' ? 'No students match this filter.' : 'No students in this classroom yet.'} />
      ) : isMobile ? (
        // Mobile cards
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {rows.map((r) => (
            <Card key={r.student_id} elevation={0} sx={{ p: 1.25, border: `1px solid ${theme.palette.divider}`, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Checkbox checked={selected.has(r.student_id)} onChange={() => toggleOne(r.student_id)} size="small" />
              <Avatar src={r.avatar_url || undefined} sx={{ width: 34, height: 34 }}>{(r.name || '?').charAt(0)}</Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={700} noWrap>{r.name || 'Student'}</Typography>
                <Box sx={{ display: 'flex', gap: 0.75, mt: 0.25, alignItems: 'center', flexWrap: 'wrap' }}>
                  <StatusChip status={r.status} />
                  {r.best_score_pct != null && <Typography variant="caption" color="text.secondary">{Math.round(r.best_score_pct)}%</Typography>}
                  <Typography variant="caption" color="text.secondary">· {fmtTime(r.active_seconds)}</Typography>
                </Box>
              </Box>
            </Card>
          ))}
        </Box>
      ) : (
        // Desktop table
        <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox size="small" checked={allVisibleSelected} indeterminate={!allVisibleSelected && rows.some((r) => selected.has(r.student_id))} onChange={toggleAll} />
                </TableCell>
                <TableCell><TableSortLabel active={sort.key === 'name'} direction={sort.dir} onClick={() => toggleSort('name')}>Student</TableSortLabel></TableCell>
                <TableCell><TableSortLabel active={sort.key === 'status'} direction={sort.dir} onClick={() => toggleSort('status')}>Status</TableSortLabel></TableCell>
                <TableCell align="right"><TableSortLabel active={sort.key === 'score'} direction={sort.dir} onClick={() => toggleSort('score')}>Score</TableSortLabel></TableCell>
                <TableCell align="right"><TableSortLabel active={sort.key === 'time'} direction={sort.dir} onClick={() => toggleSort('time')}>Time</TableSortLabel></TableCell>
                <TableCell align="right"><TableSortLabel active={sort.key === 'days'} direction={sort.dir} onClick={() => toggleSort('days')}>Days</TableSortLabel></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.student_id} hover selected={selected.has(r.student_id)}>
                  <TableCell padding="checkbox">
                    <Checkbox size="small" checked={selected.has(r.student_id)} onChange={() => toggleOne(r.student_id)} />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar src={r.avatar_url || undefined} sx={{ width: 30, height: 30 }}>{(r.name || '?').charAt(0)}</Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>{r.name || 'Student'}</Typography>
                        {r.email && <Typography variant="caption" color="text.secondary" noWrap>{r.email}</Typography>}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell><StatusChip status={r.status} /></TableCell>
                  <TableCell align="right">{r.best_score_pct != null ? `${Math.round(r.best_score_pct)}%` : '-'}</TableCell>
                  <TableCell align="right">{fmtTime(r.active_seconds)}</TableCell>
                  <TableCell align="right">{r.days_since_started != null ? r.days_since_started : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {data && (
        <StudyNudgeDialog
          open={nudgeOpen}
          fileId={data.file.id}
          fileTitle={data.file.title}
          recipients={selectedRecipients}
          getToken={getToken}
          onClose={() => setNudgeOpen(false)}
        />
      )}
    </Box>
  );
}
