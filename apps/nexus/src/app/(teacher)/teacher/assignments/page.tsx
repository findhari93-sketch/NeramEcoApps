'use client';

/**
 * Assignments hub (teacher): the classroom's assignments grouped by class day,
 * "how the class happened" at a glance. Create fast by pasting AI JSON, publish
 * drafts inline, and jump to a roster to grade. Links to the overall engagement
 * dashboard for tracking + nudging.
 *
 * Laid out for a phone first. The status tiles ARE the status filter (they used
 * to be four decorative tiles above a separate toggle), the three actions share
 * one row, and Delete lives in each card's menu rather than beside the chevron,
 * so the first assignment shows without scrolling and a stray tap cannot reach
 * the destructive action. Both filters live in the URL, so Back from an
 * assignment returns to the same slice.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import NextLink from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box, Typography, Stack, Chip, Button, Skeleton, Snackbar, Alert, IconButton, TextField, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, alpha, ToggleButton, ToggleButtonGroup,
  Menu, ListItemIcon, ListItemText, Tooltip,
} from '@neram/ui';
import ContentPasteGoIcon from '@mui/icons-material/ContentPasteGo';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import PublishOutlinedIcon from '@mui/icons-material/PublishOutlined';
import ReplayIcon from '@mui/icons-material/Replay';
import { useAuthFetch } from '@/components/curriculum/shared';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import PasteAssignmentsDialog from '@/components/assignments/bulk/PasteAssignmentsDialog';
import AssignmentSetupDialog from '@/components/assignments/AssignmentSetupDialog';
import FilterTiles from '@/components/assignments/FilterTiles';

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
type StatusFilter = 'all' | 'published' | 'draft' | 'closed';

const SOURCES: SourceFilter[] = ['all', 'class', 'standalone'];
const STATUSES: StatusFilter[] = ['all', 'published', 'draft', 'closed'];
const STATUS_WORD: Record<StatusFilter, string> = { all: '', published: 'published', draft: 'draft', closed: 'closed' };

const FORMAT_LABEL: Record<string, string> = { pdf: 'PDF', image: 'Photos', pdf_or_image: 'PDF or photos' };
// Draft grey is darker than a system grey so the chip label clears 4.5:1 on its tint.
const STATUS_COLOR: Record<string, string> = { draft: '#5F6368', published: '#2E7D32', closed: '#B54700' };

function formatDay(ymd: string): string {
  return new Date(ymd + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function TeacherAssignmentsHub() {
  const router = useRouter();
  const search = useSearchParams();
  const authFetch = useAuthFetch();
  const { loading: authLoading, classrooms, activeClassroom, getTeacherToken } = useNexusAuthContext();

  const [classroomId, setClassroomId] = useState<string>('');
  const [rows, setRows] = useState<AssignmentRow[] | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [deleteRow, setDeleteRow] = useState<AssignmentRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; row: AssignmentRow } | null>(null);
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  const rawSource = search.get('source') as SourceFilter | null;
  const rawStatus = search.get('status') as StatusFilter | null;
  const source: SourceFilter = rawSource && SOURCES.includes(rawSource) ? rawSource : 'all';
  const status: StatusFilter = rawStatus && STATUSES.includes(rawStatus) ? rawStatus : 'all';

  const setParam = (key: 'source' | 'status', value: string) => {
    const next = new URLSearchParams(search.toString());
    if (value === 'all') next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
  };

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

  // Status counts follow the source filter, so the tiles always add up to the
  // list underneath them.
  const bySource = useMemo(() => {
    const r = rows || [];
    if (source === 'class') return r.filter((a) => !!a.scheduled_class_id);
    if (source === 'standalone') return r.filter((a) => !a.scheduled_class_id);
    return r;
  }, [rows, source]);

  const statusCounts = useMemo(() => ({
    all: bySource.length,
    published: bySource.filter((a) => a.status === 'published').length,
    draft: bySource.filter((a) => a.status === 'draft').length,
    closed: bySource.filter((a) => a.status === 'closed').length,
  }), [bySource]);

  const sourceCounts = useMemo(() => {
    const r = rows || [];
    const fromClass = r.filter((a) => !!a.scheduled_class_id).length;
    return { all: r.length, class: fromClass, standalone: r.length - fromClass };
  }, [rows]);

  const visible = useMemo(
    () => (status === 'all' ? bySource : bySource.filter((a) => a.status === status)),
    [bySource, status],
  );

  const grouped = useMemo(() => {
    const byDate = new Map<string, AssignmentRow[]>();
    for (const a of visible) {
      const arr = byDate.get(a.class_date) || [];
      arr.push(a);
      byDate.set(a.class_date, arr);
    }
    return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [visible]);

  const setStatusOf = async (id: string, action: 'publish' | 'reopen') => {
    setPendingId(id);
    try {
      await authFetch(`/api/assignments/${id}`, { method: 'POST', body: JSON.stringify({ action }) });
      setSnack({
        msg: action === 'publish' ? 'Published to students.' : 'Reopened. Students can see it again.',
        sev: 'success',
      });
      load();
    } catch (err) {
      setSnack({
        msg: err instanceof Error ? err.message : action === 'publish' ? 'Could not publish' : 'Could not reopen',
        sev: 'error',
      });
    } finally {
      setPendingId(null);
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

  const hrefFor = (id: string) => `/teacher/assignments/${id}`;
  const filtered = source !== 'all' || status !== 'all';

  return (
    <Box sx={{ maxWidth: 860, mx: 'auto' }}>
      {/* Title row. Tracking sits here so the actions below stay one row wide. */}
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: { xs: 1.5, sm: 0.5 } }}>
        <Typography
          variant="h5"
          component="h1"
          sx={{ fontWeight: 800, flex: 1, minWidth: 0, fontSize: { xs: '1.35rem', sm: '1.5rem' } }}
        >
          Assignments
        </Typography>
        <Button
          component={NextLink}
          href="/teacher/assignments/overview"
          startIcon={<InsightsOutlinedIcon />}
          sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700, px: 1.5 }}
        >
          Tracking
        </Button>
        <Tooltip title="Refresh">
          <IconButton onClick={load} aria-label="Refresh" sx={{ width: 44, height: 44 }}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, display: { xs: 'none', sm: 'block' } }}>
        Create, publish and track every class assignment in one place.
      </Typography>

      {classrooms.length > 1 && (
        <TextField
          select
          size="small"
          label="Classroom"
          value={classroomId}
          onChange={(e) => setClassroomId(e.target.value)}
          sx={{ mb: 2, width: { xs: '100%', sm: 280 }, '& .MuiInputBase-root': { minHeight: 48 } }}
        >
          {classrooms.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
      )}

      {/* Create: two equal buttons on a phone, natural widths above it. */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', sm: 'auto auto' },
          justifyContent: { sm: 'start' },
          gap: 1,
          mb: 2,
        }}
      >
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setNewOpen(true)}
          disabled={!classroomId}
          sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700, whiteSpace: 'nowrap' }}
        >
          New assignment
        </Button>
        <Button
          variant="outlined"
          startIcon={<ContentPasteGoIcon />}
          onClick={() => setPasteOpen(true)}
          disabled={!classroomId}
          sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}
        >
          Paste from AI
        </Button>
      </Box>

      {(rows?.length ?? 0) > 0 && (
        <>
          <FilterTiles<StatusFilter>
            ariaLabel="Filter assignments by status"
            value={status}
            onChange={(v) => setParam('status', v)}
            tiles={[
              { value: 'all', label: 'All', count: statusCounts.all },
              { value: 'published', label: 'Published', count: statusCounts.published },
              { value: 'draft', label: 'Drafts', count: statusCounts.draft, attention: statusCounts.draft > 0 },
              { value: 'closed', label: 'Closed', count: statusCounts.closed },
            ]}
            sx={{ mb: 1 }}
          />

          {/* Where the work came from. An assignment set inside a class is the one a
              late joiner must still finish; a standalone one is not tied to a
              session at all. Same list, two very different meanings. */}
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            value={source}
            onChange={(_, v: SourceFilter | null) => v && setParam('source', v)}
            aria-label="Filter assignments by source"
            sx={{ mb: 2.5, bgcolor: 'background.paper', maxWidth: { sm: 440 } }}
          >
            {([
              { value: 'all', label: 'Any source', count: sourceCounts.all },
              { value: 'class', label: 'From a class', count: sourceCounts.class },
              { value: 'standalone', label: 'Standalone', count: sourceCounts.standalone },
            ] as const).map((o) => (
              <ToggleButton
                key={o.value}
                value={o.value}
                sx={{
                  textTransform: 'none',
                  minHeight: 44,
                  px: 0.75,
                  fontWeight: 600,
                  fontSize: '0.8125rem',
                  whiteSpace: 'nowrap',
                }}
              >
                {o.label}
                <Box component="span" sx={{ ml: 0.5, color: 'text.secondary', fontWeight: 500 }}>
                  {o.count}
                </Box>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </>
      )}

      {/* List */}
      {rows === null ? (
        <Stack spacing={1} aria-busy="true" aria-label="Loading assignments">
          <Skeleton variant="rounded" height={56} sx={{ borderRadius: 2 }} />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={104} sx={{ borderRadius: 2 }} />
          ))}
        </Stack>
      ) : rows.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6, px: 2, border: '1.5px dashed', borderColor: 'divider', borderRadius: 3 }}>
          <Typography sx={{ fontWeight: 700 }}>No assignments yet</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Create a drawing or document assignment above, or paste JSON from ChatGPT or Gemini.
          </Typography>
        </Box>
      ) : visible.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 5, px: 2, border: '1.5px dashed', borderColor: 'divider', borderRadius: 3 }}>
          <Typography sx={{ fontWeight: 700 }}>
            {status !== 'all'
              ? `No ${STATUS_WORD[status]} assignments${source === 'class' ? ' from a class' : source === 'standalone' ? ' that stand alone' : ''}`
              : source === 'class'
                ? 'Nothing came from a class yet'
                : 'Nothing standalone yet'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
            {status === 'draft'
              ? 'Everything is published. New and pasted assignments start as drafts.'
              : source === 'class'
                ? 'Open a class in the timetable and attach work to it, either new or one of these.'
                : source === 'standalone'
                  ? 'Every assignment here is attached to a class. A standalone one is not tied to a session.'
                  : 'Try another filter.'}
          </Typography>
          {filtered && (
            <Button
              variant="outlined"
              onClick={() => router.replace('?', { scroll: false })}
              sx={{ minHeight: 44, textTransform: 'none' }}
            >
              Show all
            </Button>
          )}
        </Box>
      ) : (
        <Stack spacing={2.5}>
          {grouped.map(([date, items]) => (
            <Box component="section" key={date} aria-label={formatDay(date)}>
              <Typography
                variant="caption"
                component="h2"
                sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.4 }}
              >
                {formatDay(date)}
              </Typography>
              <Stack spacing={1} sx={{ mt: 0.75 }}>
                {items.map((a) => {
                  const isDrawing = a.assignment_type === 'drawing';
                  const TypeIcon = isDrawing ? BrushOutlinedIcon : DescriptionOutlinedIcon;
                  const color = STATUS_COLOR[a.status];
                  const busy = pendingId === a.id;
                  return (
                    <Box
                      key={a.id}
                      sx={(t) => ({
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1.5,
                        py: 1.5,
                        pl: 1.5,
                        pr: 0.5,
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: 'background.paper',
                        transition: 'border-color 150ms, background-color 150ms',
                        '&:hover': { borderColor: 'primary.light' },
                        '&:has(a:focus-visible)': { outline: `2px solid ${t.palette.primary.main}`, outlineOffset: 2 },
                        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                      })}
                    >
                      <Box
                        aria-hidden
                        sx={(t) => ({
                          flexShrink: 0,
                          width: 40,
                          height: 40,
                          borderRadius: 1.5,
                          display: 'grid',
                          placeItems: 'center',
                          bgcolor: alpha(isDrawing ? '#7B1FA2' : t.palette.primary.main, 0.1),
                          color: isDrawing ? '#6A1B9A' : 'primary.dark',
                        })}
                      >
                        <TypeIcon sx={{ fontSize: 22 }} />
                      </Box>

                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        {/* The title link stretches over the whole card, so the card
                            is one big tap target while the menu and Publish buttons
                            above it stay their own controls. */}
                        <Typography
                          component={NextLink}
                          href={hrefFor(a.id)}
                          sx={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            fontWeight: 700,
                            fontSize: '0.975rem',
                            lineHeight: 1.35,
                            color: 'text.primary',
                            textDecoration: 'none',
                            outline: 'none',
                            '&::after': { content: '""', position: 'absolute', inset: 0, borderRadius: 2 },
                          }}
                        >
                          {a.title}
                        </Typography>

                        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 0.5, minWidth: 0 }}>
                          <Chip
                            label={a.status}
                            size="small"
                            sx={{
                              height: 22,
                              flexShrink: 0,
                              fontWeight: 700,
                              textTransform: 'capitalize',
                              bgcolor: alpha(color, 0.12),
                              color,
                            }}
                          />
                          <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
                            {isDrawing ? 'Drawing' : `Document, ${FORMAT_LABEL[a.submission_format] ?? 'PDF'}`}
                            {a.due_at ? ` · due ${shortDate(a.due_at)}` : ''}
                          </Typography>
                        </Stack>

                        {a.scheduled_class && (
                          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.5, minWidth: 0 }}>
                            <EventOutlinedIcon aria-hidden sx={{ fontSize: 15, color: 'primary.main', flexShrink: 0 }} />
                            <Typography variant="caption" noWrap sx={{ color: 'primary.dark', fontWeight: 600, minWidth: 0 }}>
                              {a.scheduled_class.title}
                            </Typography>
                          </Stack>
                        )}

                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.75, minHeight: 28 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 0 }}>
                            <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
                              {a.submitted_count}
                            </Box>{' '}
                            submitted · out of {a.max_marks}
                          </Typography>
                          {a.status === 'draft' && (
                            <Button
                              size="small"
                              variant="contained"
                              disabled={busy}
                              onClick={() => setStatusOf(a.id, 'publish')}
                              sx={{ position: 'relative', zIndex: 1, minHeight: 44, textTransform: 'none', fontWeight: 700 }}
                            >
                              {busy ? 'Publishing...' : 'Publish'}
                            </Button>
                          )}
                          {a.status === 'closed' && (
                            <Button
                              size="small"
                              variant="outlined"
                              disabled={busy}
                              onClick={() => setStatusOf(a.id, 'reopen')}
                              sx={{ position: 'relative', zIndex: 1, minHeight: 44, textTransform: 'none', fontWeight: 600 }}
                            >
                              {busy ? 'Reopening...' : 'Reopen'}
                            </Button>
                          )}
                        </Stack>
                      </Box>

                      <IconButton
                        aria-label={`More actions for ${a.title}`}
                        aria-haspopup="menu"
                        onClick={(e) => setMenu({ anchor: e.currentTarget, row: a })}
                        sx={{ position: 'relative', zIndex: 1, width: 44, height: 44, mt: -0.75, color: 'text.secondary' }}
                      >
                        <MoreVertIcon />
                      </IconButton>
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}

      <Menu
        anchorEl={menu?.anchor ?? null}
        open={!!menu}
        onClose={() => setMenu(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        MenuListProps={{ dense: false }}
        PaperProps={{ sx: { minWidth: 200, borderRadius: 2 } }}
      >
        <MenuItem
          sx={{ minHeight: 48 }}
          onClick={() => {
            const r = menu?.row;
            setMenu(null);
            if (r) router.push(hrefFor(r.id));
          }}
        >
          <ListItemIcon><OpenInFullIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Open</ListItemText>
        </MenuItem>
        {menu?.row.status === 'draft' && (
          <MenuItem
            sx={{ minHeight: 48 }}
            onClick={() => {
              const r = menu.row;
              setMenu(null);
              setStatusOf(r.id, 'publish');
            }}
          >
            <ListItemIcon><PublishOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Publish</ListItemText>
          </MenuItem>
        )}
        {menu?.row.status === 'closed' && (
          <MenuItem
            sx={{ minHeight: 48 }}
            onClick={() => {
              const r = menu.row;
              setMenu(null);
              setStatusOf(r.id, 'reopen');
            }}
          >
            <ListItemIcon><ReplayIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Reopen</ListItemText>
          </MenuItem>
        )}
        <MenuItem
          sx={{ minHeight: 48, color: 'error.main' }}
          onClick={() => {
            const r = menu?.row ?? null;
            setMenu(null);
            setDeleteRow(r);
          }}
        >
          <ListItemIcon><DeleteOutlineIcon fontSize="small" sx={{ color: 'error.main' }} /></ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>

      {/* The same component the timetable opens, so the two entry points cannot
          drift. With no class in context there is nothing to link to, so it
          opens straight on Create. */}
      <AssignmentSetupDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        classroomId={classroomId}
        authFetch={authFetch}
        getToken={getTeacherToken}
        onSaved={load}
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

      <Dialog
        open={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        fullWidth
        maxWidth="xs"
        PaperProps={{ sx: { borderRadius: 3, mx: 2, width: 'calc(100% - 32px)' } }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>Delete this assignment?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {deleteRow ? `"${deleteRow.title}" will be removed. ` : ''}This can&apos;t be undone. Assignments with submissions can&apos;t be deleted, close them instead.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setDeleteRow(null)} sx={{ minHeight: 44, textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={deleting}
            onClick={confirmDelete}
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Lifted clear of the bottom nav on a phone. */}
      <Snackbar
        open={!!snack}
        autoHideDuration={3500}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 80, md: 24 } }}
      >
        <Alert severity={snack?.sev || 'success'} onClose={() => setSnack(null)}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}

/** useSearchParams needs a Suspense boundary, or the route opts out of static generation. */
export default function TeacherAssignmentsPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ maxWidth: 860, mx: 'auto' }}>
          <Skeleton variant="text" width={180} height={40} />
          <Skeleton variant="rounded" height={48} sx={{ mt: 1.5, borderRadius: 2 }} />
          <Skeleton variant="rounded" height={104} sx={{ mt: 2, borderRadius: 2 }} />
        </Box>
      }
    >
      <TeacherAssignmentsHub />
    </Suspense>
  );
}
