'use client';

/**
 * Assignments tracking dashboard (teacher): who is Active / Partial / Inactive
 * across all published assignments, judged on each student's personal clock so
 * late joiners are fair. Filter, multi-select, and message the selected students
 * on Teams (with the assignment links attached).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Typography, Stack, Chip, Button, Skeleton, IconButton, TextField, MenuItem, Checkbox, Avatar,
  ToggleButton, ToggleButtonGroup, alpha,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SendIcon from '@mui/icons-material/Send';
import SearchIcon from '@mui/icons-material/Search';
import { useAuthFetch } from '@/components/curriculum/shared';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import AssignmentNudgeDialog from '@/components/assignments/AssignmentNudgeDialog';

type Status = 'active' | 'partial' | 'inactive';
interface EngagementRow {
  student: { id: string; name: string | null; email: string | null; avatar_url: string | null };
  is_late_joiner: boolean;
  applicable: number;
  submitted: number;
  reviewed: number;
  on_time: number;
  avg_marks_pct: number | null;
  last_submitted_at: string | null;
  days_since_last: number | null;
  status: Status;
}
interface Engagement {
  stats: { total_students: number; active: number; partial: number; inactive: number; avg_marks_pct: number | null };
  rows: EngagementRow[];
}

const STATUS_COLOR: Record<Status, string> = { active: '#2E7D32', partial: '#B8860B', inactive: '#C62828' };
const STATUS_LABEL: Record<Status, string> = { active: 'Active', partial: 'Partial', inactive: 'Inactive' };

export default function AssignmentsOverviewPage() {
  const router = useRouter();
  const authFetch = useAuthFetch();
  const { loading: authLoading, classrooms, activeClassroom, getTeacherToken } = useNexusAuthContext();

  const [classroomId, setClassroomId] = useState('');
  const [data, setData] = useState<Engagement | null>(null);
  const [assignments, setAssignments] = useState<{ id: string; title: string }[]>([]);
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [nudgeOpen, setNudgeOpen] = useState(false);

  useEffect(() => {
    if (activeClassroom?.id && !classroomId) setClassroomId(activeClassroom.id);
  }, [activeClassroom, classroomId]);

  const load = useCallback(async () => {
    if (!classroomId) return;
    setData(null);
    setSelected(new Set());
    try {
      const [eng, list] = await Promise.all([
        authFetch(`/api/assignments/engagement?classroom=${classroomId}`),
        authFetch(`/api/assignments?classroom=${classroomId}&status=published`),
      ]);
      setData(eng as Engagement);
      setAssignments((list.assignments || []).map((a: any) => ({ id: a.id, title: a.title })));
    } catch {
      setData({ stats: { total_students: 0, active: 0, partial: 0, inactive: 0, avg_marks_pct: null }, rows: [] });
    }
  }, [authFetch, classroomId]);

  useEffect(() => {
    if (!authLoading && classroomId) load();
  }, [authLoading, classroomId, load]);

  const visibleRows = useMemo(() => {
    const rows = data?.rows || [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (q && !(r.student.name || r.student.email || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, filter, search]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.student.id));
  const toggleAll = () =>
    setSelected((s) => {
      const next = new Set(s);
      if (allVisibleSelected) visibleRows.forEach((r) => next.delete(r.student.id));
      else visibleRows.forEach((r) => next.add(r.student.id));
      return next;
    });

  const recipients = useMemo(() => {
    const rows = data?.rows || [];
    return rows.filter((r) => selected.has(r.student.id)).map((r) => ({ id: r.student.id, name: r.student.name }));
  }, [data, selected]);

  const stats = data?.stats;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 960, mx: 'auto', pb: selected.size ? 10 : 3 }}>
      <Button startIcon={<ArrowBackIcon />} onClick={() => router.push('/teacher/assignments')} sx={{ mb: 1, minHeight: 44, color: 'text.secondary', fontWeight: 600 }}>
        Assignments
      </Button>
      <Typography variant="h5" sx={{ fontWeight: 800, fontSize: { xs: '1.3rem', sm: '1.5rem' } }}>
        Tracking dashboard
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Consistency across all published assignments, on each student's own clock.
      </Typography>

      {classrooms.length > 1 && (
        <TextField select size="small" label="Classroom" value={classroomId} onChange={(e) => setClassroomId(e.target.value)} sx={{ mb: 2, minWidth: 220 }}>
          {classrooms.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
      )}

      {/* Stat tiles */}
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        {[
          { label: 'Active', value: stats?.active ?? 0, color: STATUS_COLOR.active },
          { label: 'Partial', value: stats?.partial ?? 0, color: STATUS_COLOR.partial },
          { label: 'Inactive', value: stats?.inactive ?? 0, color: STATUS_COLOR.inactive },
          { label: 'Avg marks', value: stats?.avg_marks_pct != null ? `${stats.avg_marks_pct}%` : '—', color: '#1565C0' },
        ].map((s) => (
          <Box key={s.label} sx={{ flex: '1 1 120px', p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', textAlign: 'center' }}>
            <Typography variant="h6" sx={{ fontWeight: 800, color: s.color }}>
              {s.value}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {s.label}
            </Typography>
          </Box>
        ))}
      </Stack>

      {/* Filter + search */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1.5 }}>
        <ToggleButtonGroup value={filter} exclusive size="small" onChange={(_, v) => v && setFilter(v)} sx={{ '& .MuiToggleButton-root': { textTransform: 'none', minHeight: 40 } }}>
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="active">Active</ToggleButton>
          <ToggleButton value="partial">Partial</ToggleButton>
          <ToggleButton value="inactive">Inactive</ToggleButton>
        </ToggleButtonGroup>
        <TextField
          size="small"
          placeholder="Search students"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <SearchIcon sx={{ fontSize: 18, mr: 0.5, color: 'text.disabled' }} /> }}
          sx={{ flex: 1 }}
        />
      </Stack>

      {data === null ? (
        <Stack spacing={1}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={56} sx={{ borderRadius: 2 }} />
          ))}
        </Stack>
      ) : visibleRows.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6, border: '1.5px dashed', borderColor: 'divider', borderRadius: 3 }}>
          <Typography variant="body2" color="text.disabled">
            No students match this filter.
          </Typography>
        </Box>
      ) : (
        <>
          <Stack direction="row" alignItems="center" sx={{ mb: 0.5, px: 0.5 }}>
            <Checkbox checked={allVisibleSelected} indeterminate={selected.size > 0 && !allVisibleSelected} onChange={toggleAll} sx={{ p: 0.5 }} />
            <Typography variant="caption" color="text.secondary">
              Select all ({visibleRows.length})
            </Typography>
          </Stack>
          <Stack spacing={1}>
            {visibleRows.map((r) => (
              <Box
                key={r.student.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  p: 1.25,
                  minHeight: 56,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: selected.has(r.student.id) ? 'primary.main' : 'divider',
                  bgcolor: selected.has(r.student.id) ? alpha('#1565C0', 0.05) : 'transparent',
                }}
              >
                <Checkbox checked={selected.has(r.student.id)} onChange={() => toggle(r.student.id)} sx={{ p: 0.5 }} />
                <Avatar src={r.student.avatar_url || undefined} sx={{ width: 34, height: 34, bgcolor: 'primary.dark' }}>
                  {(r.student.name || '?').slice(0, 1).toUpperCase()}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {r.student.name || r.student.email}
                    </Typography>
                    {r.is_late_joiner && <Chip label="Late joiner" size="small" sx={{ height: 18, fontSize: '0.6rem' }} />}
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {r.submitted}/{r.applicable} done · {r.on_time} on time
                    {r.avg_marks_pct != null ? ` · ${r.avg_marks_pct}%` : ''}
                    {r.days_since_last != null ? ` · ${r.days_since_last}d ago` : ''}
                  </Typography>
                </Box>
                <Chip
                  label={STATUS_LABEL[r.status]}
                  size="small"
                  sx={{ height: 22, fontWeight: 700, bgcolor: alpha(STATUS_COLOR[r.status], 0.14), color: STATUS_COLOR[r.status] }}
                />
              </Box>
            ))}
          </Stack>
        </>
      )}

      {/* Sticky selection bar */}
      {selected.size > 0 && (
        <Box
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            p: 1.5,
            bgcolor: 'background.paper',
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            zIndex: 1200,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, textAlign: { xs: 'left', sm: 'right' } }}>
            {selected.size} selected
          </Typography>
          <Button variant="outlined" onClick={() => setSelected(new Set())} sx={{ minHeight: 44, textTransform: 'none' }}>
            Clear
          </Button>
          <Button variant="contained" startIcon={<SendIcon />} onClick={() => setNudgeOpen(true)} sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700 }}>
            Message
          </Button>
        </Box>
      )}

      <AssignmentNudgeDialog
        open={nudgeOpen}
        assignments={assignments}
        recipients={recipients}
        getToken={getTeacherToken}
        onClose={() => setNudgeOpen(false)}
      />
    </Box>
  );
}
