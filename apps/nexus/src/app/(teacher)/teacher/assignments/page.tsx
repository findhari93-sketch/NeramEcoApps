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
  alpha,
} from '@neram/ui';
import ContentPasteGoIcon from '@mui/icons-material/ContentPasteGo';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useAuthFetch } from '@/components/curriculum/shared';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import PasteAssignmentsDialog from '@/components/assignments/bulk/PasteAssignmentsDialog';

interface AssignmentRow {
  id: string;
  title: string;
  class_date: string;
  status: 'draft' | 'published' | 'closed';
  submission_format: 'pdf' | 'image' | 'pdf_or_image';
  max_marks: number;
  due_at: string | null;
  attachment_count: number;
  submitted_count: number;
}

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

  const grouped = useMemo(() => {
    const byDate = new Map<string, AssignmentRow[]>();
    for (const a of rows || []) {
      const arr = byDate.get(a.class_date) || [];
      arr.push(a);
      byDate.set(a.class_date, arr);
    }
    return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [rows]);

  const publish = async (id: string) => {
    try {
      await authFetch(`/api/assignments/${id}`, { method: 'POST', body: JSON.stringify({ action: 'publish' }) });
      setSnack({ msg: 'Published to students.', sev: 'success' });
      load();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Could not publish', sev: 'error' });
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
          startIcon={<ContentPasteGoIcon />}
          onClick={() => setPasteOpen(true)}
          disabled={!classroomId}
          sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
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
            Paste JSON from ChatGPT or Gemini to create your first one in seconds.
          </Typography>
          <Button variant="contained" startIcon={<ContentPasteGoIcon />} onClick={() => setPasteOpen(true)} sx={{ minHeight: 44, textTransform: 'none' }}>
            Paste from AI
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
                        <Chip label={FORMAT_LABEL[a.submission_format]} size="small" variant="outlined" sx={{ height: 20 }} />
                        <Typography variant="caption" color="text.secondary">
                          {a.submitted_count} submitted · /{a.max_marks}
                          {a.due_at ? ` · due ${new Date(a.due_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                        </Typography>
                      </Stack>
                    </Box>
                    {a.status === 'draft' ? (
                      <Button size="small" variant="contained" onClick={() => publish(a.id)} sx={{ minHeight: 40, textTransform: 'none' }}>
                        Publish
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

      <Snackbar open={!!snack} autoHideDuration={3500} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack?.sev || 'success'} onClose={() => setSnack(null)}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
