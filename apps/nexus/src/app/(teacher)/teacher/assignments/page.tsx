'use client';

/**
 * Assignments hub (teacher): the classroom's assignments grouped by class day,
 * "how the class happened" at a glance. Create fast by pasting AI JSON, publish
 * drafts inline, and jump to a roster to grade. Links to the overall engagement
 * dashboard for tracking + nudging.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Typography, Stack, Chip, Button, Skeleton, Snackbar, Alert, IconButton, TextField, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, alpha, ToggleButton, ToggleButtonGroup,
} from '@neram/ui';
import ContentPasteGoIcon from '@mui/icons-material/ContentPasteGo';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import { useAuthFetch } from '@/components/curriculum/shared';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import PasteAssignmentsDialog from '@/components/assignments/bulk/PasteAssignmentsDialog';
import NewAssignmentDialog from '@/components/assignments/NewAssignmentDialog';

interface AssignmentRow {
  id: string;
  title: string;
  class_date: string;
  status: 'draft' | 'published' | 'closed';
  assignment_type: 'drawing' | 'document';
  submission_format: 'pdf' | 'image' | 'pdf_or_image';
  max_marks: number;
  due_at: string | null;
  attachment_count: number;
  submitted_count: number;
  /** Set when the assignment was given in a timetable class. Null is normal:
   *  most assignments are standalone and stay that way. */
  scheduled_class_id: string | null;
  scheduled_class?: {
    id: string;
    title: string;
    scheduled_date: string;
    start_time: string;
  } | null;
}

/** The three ways a teacher wants to look at this list. */
type SourceFilter = 'all' | 'class' | 'standalone';

const FORMAT_LABEL: Record<string, string> = { pdf: 'PDF', image: 'Photos', pdf_or_image: 'PDF/Photos' };
const STATUS_COLOR: Record<string, string> = { draft: '#8E8E93', published: '#2E7D32', closed: '#B54700' };

function formatDay(ymd: string): string {
  return new Date(ymd + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function TeacherAssignmentsHub() {
  const router = useRouter();
  const authFetch = useAuthFetch();
  const { loading: authLoading, classrooms, activeClassroom, getTeacherToken } = useNexusAuthContext();

  const [classroomId, setClassroomId] = useState<string>('');
  const [rows, setRows] = useState<AssignmentRow[] | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [source, setSource] = useState<SourceFilter>('all');
  const [deleteRow, setDeleteRow] = useState<AssignmentRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (activeClassroom?.id && !classroomId) setClassroomId(activeClassroom.id);
  }, [activeClassroom, classroomId]);

  const load = useCallback(async () => {
    if (!classroomId) return;
    setRows(null);
    try {
      const res = await authFetch(`/api/assignments?classroom=${classroomId}`);
      setRows(res.assignments as AssignmentRow[]);
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to load', sev: 'error' });
      setRows([]);
    }
  }, [authFetch, classroomId]);

  useEffect(() => {
    if (!authLoading && classroomId) load();
  }, [authLoading, classroomId, load]);

  const stats = useMemo(() => {
    const r = rows || [];
    return {
      total: r.length,
      published: r.filter((a) => a.status === 'published').length,
      drafts: r.filter((a) => a.status === 'draft').length,
      submissions: r.reduce((n, a) => n + a.submitted_count, 0),
    };
  }, [rows]);

  const sourceCounts = useMemo(() => {
    const r = rows || [];
    const fromClass = r.filter((a) => !!a.scheduled_class_id).length;
    return { all: r.length, class: fromClass, standalone: r.length - fromClass };
  }, [rows]);

  const visible = useMemo(() => {
    const r = rows || [];
    if (source === 'class') return r.filter((a) => !!a.scheduled_class_id);
    if (source === 'standalone') return r.filter((a) => !a.scheduled_class_id);
    return r;
  }, [rows, source]);

  const grouped = useMemo(() => {
    const byDate = new Map<string, AssignmentRow[]>();
    for (const a of visible) {
      const arr = byDate.get(a.class_date) || [];
      arr.push(a);
      byDate.set(a.class_date, arr);
    }
    return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [visible]);

  const publish = async (id: string) => {
    try {
      await authFetch(`/api/assignments/${id}`, { method: 'POST', body: JSON.stringify({ action: 'publish' }) });
      setSnack({ msg: 'Published to students.', sev: 'success' });
      load();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Could not publish', sev: 'error' });
    }
  };

  const reopen = async (id: string) => {
    try {
      await authFetch(`/api/assignments/${id}`, { method: 'POST', body: JSON.stringify({ action: 'reopen' }) });
      setSnack({ msg: 'Reopened. Students can see it again.', sev: 'success' });
      load();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Could not reopen', sev: 'error' });
    }
  };

  const confirmDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      await authFetch(`/api/assignments/${deleteRow.id}`, { method: 'DELETE' });
      setSnack({ msg: 'Assignment deleted.', sev: 'success' });
      setDeleteRow(null);
      load();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Could not delete', sev: 'error' });
      setDeleteRow(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 860, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 800, flex: 1, fontSize: { xs: '1.3rem', sm: '1.5rem' } }}>
          Assignments
        </Typography>
        <IconButton onClick={load} aria-label="Refresh" sx={{ width: 44, height: 44 }}>
          <RefreshIcon />
        </IconButton>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Create, publish and track every class assignment in one place.
      </Typography>

      {classrooms.length > 1 && (
        <TextField
          select
          size="small"
          label="Classroom"
          value={classroomId}
          onChange={(e) => setClassroomId(e.target.value)}
          sx={{ mb: 2, minWidth: 220 }}
        >
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
          { label: 'Assignments', value: stats.total },
          { label: 'Published', value: stats.published },
          { label: 'Drafts', value: stats.drafts },
          { label: 'Submissions', value: stats.submissions },
        ].map((s) => (
          <Box
            key={s.label}
            sx={{ flex: '1 1 120px', p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', textAlign: 'center' }}
          >
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {s.value}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {s.label}
            </Typography>
          </Box>
        ))}
      </Stack>

      {/* Actions */}
      <Stack direction="row" spacing={1} sx={{ mb: 2.5 }} flexWrap="wrap" useFlexGap>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setNewOpen(true)}
          disabled={!classroomId}
          sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
        >
          New assignment
        </Button>
        <Button
          variant="outlined"
          startIcon={<ContentPasteGoIcon />}
          onClick={() => setPasteOpen(true)}
          disabled={!classroomId}
          sx={{ minHeight: 48, textTransform: 'none' }}
        >
          Paste from AI
        </Button>
        <Button
          variant="outlined"
          startIcon={<InsightsOutlinedIcon />}
          onClick={() => router.push('/teacher/assignments/overview')}
          sx={{ minHeight: 48, textTransform: 'none' }}
        >
          Tracking dashboard
        </Button>
      </Stack>

      {/* Where the work came from. An assignment set inside a class is the one a
          late joiner must still finish; a standalone one is not tied to a
          session at all. Same list, two very different meanings. */}
      {(rows?.length ?? 0) > 0 && (
        <ToggleButtonGroup
          exclusive
          size="small"
          value={source}
          onChange={(_, v: SourceFilter | null) => v && setSource(v)}
          aria-label="Filter assignments by source"
          sx={{ mb: 2, flexWrap: 'wrap' }}
        >
          {([
            { value: 'all', label: 'All', count: sourceCounts.all },
            { value: 'class', label: 'From a class', count: sourceCounts.class },
            { value: 'standalone', label: 'Standalone', count: sourceCounts.standalone },
          ] as const).map((o) => (
            <ToggleButton
              key={o.value}
              value={o.value}
              sx={{ textTransform: 'none', minHeight: 44, px: 2, fontWeight: 600 }}
            >
              {o.label}
              <Box component="span" sx={{ ml: 0.75, color: 'text.secondary', fontWeight: 500 }}>
                {o.count}
              </Box>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}

      {/* List */}
      {rows === null ? (
        <Stack spacing={1}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={64} sx={{ borderRadius: 2 }} />
          ))}
        </Stack>
      ) : rows.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6, border: '1.5px dashed', borderColor: 'divider', borderRadius: 3 }}>
          <Typography sx={{ fontWeight: 700 }}>No assignments yet</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
            Create a drawing or document assignment, or paste JSON from ChatGPT/Gemini.
          </Typography>
          <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNewOpen(true)} sx={{ minHeight: 44, textTransform: 'none' }}>
              New assignment
            </Button>
            <Button variant="outlined" startIcon={<ContentPasteGoIcon />} onClick={() => setPasteOpen(true)} sx={{ minHeight: 44, textTransform: 'none' }}>
              Paste from AI
            </Button>
          </Stack>
        </Box>
      ) : visible.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 5, border: '1.5px dashed', borderColor: 'divider', borderRadius: 3 }}>
          <Typography sx={{ fontWeight: 700 }}>
            {source === 'class' ? 'Nothing came from a class yet' : 'Nothing standalone yet'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
            {source === 'class'
              ? 'Open a class in the timetable and attach work to it, either new or one of these.'
              : 'Every assignment here is attached to a class. A standalone one is not tied to a session.'}
          </Typography>
          <Button
            variant="outlined"
            onClick={() => setSource('all')}
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            Show all
          </Button>
        </Box>
      ) : (
        <Stack spacing={2.5}>
          {grouped.map(([date, items]) => (
            <Box key={date}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {formatDay(date)}
              </Typography>
              <Stack spacing={1} sx={{ mt: 0.75 }}>
                {items.map((a) => (
                  <Box
                    key={a.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      p: 1.5,
                      minHeight: 64,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      '&:hover': { borderColor: 'primary.light', bgcolor: 'action.hover' },
                    }}
                  >
                    <Box
                      role="button"
                      onClick={() => router.push(`/teacher/assignments/${a.id}`)}
                      sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                        {a.title}
                      </Typography>
                      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                        <Chip
                          label={a.status}
                          size="small"
                          sx={{ height: 20, fontWeight: 700, textTransform: 'capitalize', bgcolor: alpha(STATUS_COLOR[a.status], 0.14), color: STATUS_COLOR[a.status] }}
                        />
                        <Chip
                          icon={a.assignment_type === 'drawing' ? <BrushOutlinedIcon sx={{ fontSize: 13 }} /> : <DescriptionOutlinedIcon sx={{ fontSize: 13 }} />}
                          label={a.assignment_type === 'drawing' ? 'Drawing' : 'Document'}
                          size="small"
                          variant="outlined"
                          sx={{ height: 20 }}
                        />
                        {a.assignment_type !== 'drawing' && (
                          <Chip label={FORMAT_LABEL[a.submission_format]} size="small" variant="outlined" sx={{ height: 20 }} />
                        )}
                        {a.scheduled_class && (
                          <Chip
                            icon={<EventOutlinedIcon sx={{ fontSize: 13 }} />}
                            label={a.scheduled_class.title}
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push('/teacher/timetable');
                            }}
                            sx={{
                              height: 20,
                              maxWidth: 200,
                              fontWeight: 600,
                              cursor: 'pointer',
                              bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
                              color: 'primary.dark',
                            }}
                          />
                        )}
                        <Typography variant="caption" color="text.secondary">
                          {a.submitted_count} submitted · /{a.max_marks}
                          {a.due_at ? ` · due ${new Date(a.due_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                        </Typography>
                      </Stack>
                    </Box>
                    <IconButton onClick={() => setDeleteRow(a)} sx={{ width: 40, height: 40 }} aria-label="Delete">
                      <DeleteOutlineIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                    </IconButton>
                    {a.status === 'draft' ? (
                      <Button size="small" variant="contained" onClick={() => publish(a.id)} sx={{ minHeight: 40, textTransform: 'none' }}>
                        Publish
                      </Button>
                    ) : a.status === 'closed' ? (
                      <Button size="small" variant="outlined" onClick={() => reopen(a.id)} sx={{ minHeight: 40, textTransform: 'none' }}>
                        Reopen
                      </Button>
                    ) : (
                      <IconButton onClick={() => router.push(`/teacher/assignments/${a.id}`)} sx={{ width: 40, height: 40 }} aria-label="Open">
                        <ChevronRightIcon />
                      </IconButton>
                    )}
                  </Box>
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}

      <NewAssignmentDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        classroomId={classroomId}
        authFetch={authFetch}
        getToken={getTeacherToken}
        onCreated={load}
      />

      <PasteAssignmentsDialog
        open={pasteOpen}
        classroomId={classroomId}
        getToken={getTeacherToken}
        onClose={() => setPasteOpen(false)}
        onCreated={(n) => {
          setSnack({ msg: `Created ${n} draft assignment${n === 1 ? '' : 's'}.`, sev: 'success' });
          load();
        }}
      />

      <Dialog open={!!deleteRow} onClose={() => setDeleteRow(null)} PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>Delete this assignment?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {deleteRow ? `"${deleteRow.title}" will be removed. ` : ''}This can&apos;t be undone. Assignments with submissions can&apos;t be deleted, close them instead.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setDeleteRow(null)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" color="error" disabled={deleting} onClick={confirmDelete} sx={{ textTransform: 'none' }}>
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={3500} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack?.sev || 'success'} onClose={() => setSnack(null)}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
