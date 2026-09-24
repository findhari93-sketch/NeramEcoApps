'use client';

/**
 * Assignments tracking dashboard (teacher): who is Active / Partial / Inactive
 * across all published assignments, judged on each student's personal clock so
 * late joiners are fair. Filter, multi-select, and message the selected students
 * on Teams (with the assignment links attached).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Stack, Chip, Button, Skeleton, TextField, MenuItem, Checkbox,
  alpha, Snackbar, Alert,
} from '@neram/ui';
import NextLink from 'next/link';
import StudentAvatar from '@/components/students/StudentAvatar';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SendIcon from '@mui/icons-material/Send';
import { useAuthFetch } from '@/components/curriculum/shared';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import FilterTiles from '@/components/assignments/FilterTiles';
import AssignmentNudgeDialog from '@/components/assignments/AssignmentNudgeDialog';
import PreworkEscalationCard from '@/components/assignments/PreworkEscalationCard';
import StudentListToolbar, { PausedFootnote } from '@/components/students/list/StudentListToolbar';
import { useStudentListView } from '@/components/students/list/useStudentListView';
import type { ListAccessors } from '@/lib/student-list-view';

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
  enrolled_at?: string | null;
}
interface Engagement {
  stats: { total_students: number; active: number; partial: number; inactive: number; avg_marks_pct: number | null };
  rows: EngagementRow[];
}

const ENGAGEMENT_ACCESSORS: ListAccessors<EngagementRow> = {
  id: (r) => r.student.id,
  name: (r) => r.student.name,
  email: (r) => r.student.email,
  joinedAt: (r) => r.enrolled_at,
};
const ENGAGEMENT_STATUS = { of: (r: EngagementRow) => r.status, order: ['active', 'partial', 'inactive'] as Status[] };

// Partial is a dark amber: goldenrod (#B8860B) read at about 3:1 on white.
const STATUS_COLOR: Record<Status, string> = { active: '#2E7D32', partial: '#8A6300', inactive: '#C62828' };
const STATUS_LABEL: Record<Status, string> = { active: 'Active', partial: 'Partial', inactive: 'Inactive' };

export default function AssignmentsOverviewPage() {
  const authFetch = useAuthFetch();
  const { loading: authLoading, classrooms, activeClassroom, getTeacherToken } = useNexusAuthContext();

  const [classroomId, setClassroomId] = useState('');
  const [data, setData] = useState<Engagement | null>(null);
  const [assignments, setAssignments] = useState<{ id: string; title: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' | 'warning' } | null>(null);

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

  // The shared student list: ranked search, sort, stage filter and the status
  // toggle, all in the URL; paused students are hidden (the server already drops them).
  const view = useStudentListView<EngagementRow, never, Status>({
    rows: data?.rows,
    accessors: ENGAGEMENT_ACCESSORS,
    defaultSort: 'name',
    status: ENGAGEMENT_STATUS,
    storageKey: 'nexus:assignments-overview:sort',
  });
  const visibleRows = view.shown;
  const filter = view.status;

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
    <Box sx={{ maxWidth: 960, mx: 'auto', pb: selected.size ? 10 : 0 }}>
      <Button
        component={NextLink}
        href="/teacher/assignments"
        startIcon={<ArrowBackIcon />}
        sx={{ mb: 0.5, ml: -1, minHeight: 44, color: 'text.secondary', fontWeight: 600, textTransform: 'none' }}
      >
        Assignments
      </Button>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 800, fontSize: { xs: '1.3rem', sm: '1.5rem' } }}>
        Tracking dashboard
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Across all published assignments, on each student&apos;s own clock.
        {stats?.avg_marks_pct != null && (
          <>
            {' '}Average marks{' '}
            <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{stats.avg_marks_pct}%</Box>.
          </>
        )}
      </Typography>

      {classrooms.length > 1 && (
        <TextField select size="small" label="Classroom" value={classroomId} onChange={(e) => setClassroomId(e.target.value)} sx={{ mb: 2, width: { xs: '100%', sm: 280 }, '& .MuiInputBase-root': { minHeight: 48 } }}>
          {classrooms.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
      )}

      {/* Students whose pre-class work has become a pattern. Renders nothing
          when the queue is empty, which is the normal state. */}
      <PreworkEscalationCard
        classroomId={classroomId}
        authFetch={authFetch}
        onNotify={(message, severity = 'success') => setToast({ message, severity })}
      />

      {/* The tiles ARE the status filter (they used to sit above a second,
          identical toggle row). Average marks moved into the line above. */}
      <StudentListToolbar
        view={view}
        statusSlot={
          <FilterTiles<Status | 'all'>
            ariaLabel="Filter by status"
            value={filter}
            onChange={(v) => view.setStatus(v)}
            tiles={[
              {
                value: 'all',
                label: 'All',
                count:
                  (view.statusCounts.active ?? 0) + (view.statusCounts.partial ?? 0) + (view.statusCounts.inactive ?? 0),
              },
              { value: 'active', label: 'Active', count: view.statusCounts.active ?? 0, color: STATUS_COLOR.active },
              { value: 'partial', label: 'Partial', count: view.statusCounts.partial ?? 0, color: STATUS_COLOR.partial },
              { value: 'inactive', label: 'Inactive', count: view.statusCounts.inactive ?? 0, color: STATUS_COLOR.inactive },
            ]}
            sx={{ mb: 1.5 }}
          />
        }
      />

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
          <Box
            component="label"
            sx={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, mb: 0.5, pr: 1.5, cursor: 'pointer' }}
          >
            <Checkbox checked={allVisibleSelected} indeterminate={selected.size > 0 && !allVisibleSelected} onChange={toggleAll} sx={{ p: 1.25 }} />
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
              Select all ({visibleRows.length})
            </Typography>
          </Box>
          <Stack spacing={1}>
            {visibleRows.map((r) => (
              // The whole row is the checkbox's label, so a tap anywhere selects.
              <Box
                key={r.student.id}
                component="label"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  py: 1,
                  pl: 0.25,
                  pr: 1.25,
                  minHeight: 60,
                  cursor: 'pointer',
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: selected.has(r.student.id) ? 'primary.main' : 'divider',
                  bgcolor: selected.has(r.student.id) ? alpha('#1565C0', 0.05) : 'background.paper',
                  '&:has(input:focus-visible)': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                }}
              >
                <Checkbox
                  checked={selected.has(r.student.id)}
                  onChange={() => toggle(r.student.id)}
                  inputProps={{ 'aria-label': `Select ${r.student.name || r.student.email || 'student'}` }}
                  sx={{ p: 1.25 }}
                />
                <StudentAvatar
                  userId={r.student.id}
                  src={r.student.avatar_url}
                  name={r.student.name}
                  size={34}
                  tapToView={false}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {r.student.name || r.student.email}
                    </Typography>
                    {r.is_late_joiner && <Chip label="Late joiner" size="small" sx={{ height: 20, fontSize: '0.6875rem', flexShrink: 0 }} />}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {r.submitted}/{r.applicable} done · {r.on_time} on time
                    {r.avg_marks_pct != null ? ` · ${r.avg_marks_pct}%` : ''}
                    {r.days_since_last != null ? ` · ${r.days_since_last}d ago` : ''}
                  </Typography>
                </Box>
                <Chip
                  label={STATUS_LABEL[r.status]}
                  size="small"
                  sx={{ height: 22, flexShrink: 0, fontWeight: 700, bgcolor: alpha(STATUS_COLOR[r.status], 0.14), color: STATUS_COLOR[r.status] }}
                />
              </Box>
            ))}
          </Stack>
        </>
      )}
      <PausedFootnote count={view.pausedHidden} />

      {/* Sticky selection bar */}
      {selected.size > 0 && (
        <Box
          sx={{
            // Covers the bottom nav while a selection is live, like BulkSelectBar.
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            px: 2,
            pt: 1.5,
            pb: 'calc(12px + env(safe-area-inset-bottom))',
            bgcolor: 'background.paper',
            borderTop: '1px solid',
            borderColor: 'divider',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.10)',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
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

      <Snackbar
        open={!!toast}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 80, md: 24 } }}
      >
        <Alert severity={toast?.severity || 'success'} onClose={() => setToast(null)}>
          {toast?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
