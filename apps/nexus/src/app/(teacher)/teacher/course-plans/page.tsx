'use client';

/**
 * Course Plans overview: one card per plan. The active plan shows day
 * progress and quick links into Builder / Schedule / Health; archived plans
 * can be duplicated as a template for the next batch.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Card,
  Chip,
  Button,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Stack,
  LinearProgress,
  Snackbar,
  Alert,
  Switch,
  FormControlLabel,
  EmptyState,
  Avatar,
  Collapse,
  alpha,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useAuthFetch } from '@/components/curriculum/shared';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { addDays, isClassDay, istToday } from '@/lib/plan-flow';
import type { NexusTeachingPlan } from '@neram/database';

type PlanCard = NexusTeachingPlan & {
  entry_count: number;
  done_count: number;
  test_count: number;
  topic_count: number;
  module_count: number;
};

const EXAM_OPTIONS = [
  { value: 'nata', label: 'NATA' },
  { value: 'jee', label: 'JEE' },
  { value: 'foundation', label: 'Foundation' },
  { value: 'custom', label: 'Custom' },
];

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: '#8D5A00', bg: 'rgba(249,168,37,0.18)' },
  active: { label: 'Active', color: '#1B5E20', bg: 'rgba(46,125,50,0.12)' },
  completed: { label: 'Completed', color: '#1565C0', bg: 'rgba(21,101,192,0.1)' },
  archived: { label: 'Archived', color: '#5A6672', bg: 'rgba(139,149,161,0.15)' },
};

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Rough day progress from the plan window (Sundays and optional Saturdays skipped). */
function dayProgress(p: PlanCard, today: string): { day: number; total: number } | null {
  const opts = { saturdayClasses: p.saturday_classes ?? true };
  let total = 0;
  let passed = 0;
  let d = p.start_date;
  let guard = 0;
  while (d <= p.expected_end_date && guard < 400) {
    if (isClassDay(d, opts)) {
      total++;
      if (d <= today) passed++;
    }
    d = addDays(d, 1);
    guard++;
  }
  if (!total) return null;
  return { day: Math.max(1, Math.min(passed, total)), total };
}

export default function CoursePlansPage() {
  const router = useRouter();
  const { loading: authLoading, user, activeClassroom, classrooms } = useNexusAuthContext();
  const authFetch = useAuthFetch();
  const today = istToday();

  const [plans, setPlans] = useState<PlanCard[] | null>(null);
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: 'archive' | 'delete'; plan: PlanCard } | null>(null);

  const [dialog, setDialog] = useState(false);
  const [pTitle, setPTitle] = useState('');
  const [pExam, setPExam] = useState('nata');
  const [pClassroom, setPClassroom] = useState('');
  const [pStart, setPStart] = useState('');
  const [pEnd, setPEnd] = useState('');
  const [pExamDate, setPExamDate] = useState('');
  const [pSaturday, setPSaturday] = useState(true);
  const [duplicateFrom, setDuplicateFrom] = useState<PlanCard | null>(null);
  const [editingPlan, setEditingPlan] = useState<PlanCard | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await authFetch('/api/teaching-plans?include_archived=1');
      setPlans(data.plans);
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to load plans', sev: 'error' });
      setPlans([]);
    }
  }, [authFetch]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const openDialog = (source?: PlanCard) => {
    setEditingPlan(null);
    setDuplicateFrom(source || null);
    setPTitle(source ? `${source.title} (copy)` : '');
    setPExam(source?.exam_type || 'nata');
    setPClassroom(source?.classroom_id || activeClassroom?.id || classrooms?.[0]?.id || '');
    setPStart(today);
    setPEnd(addDays(today, 90));
    setPExamDate(source?.exam_date || '');
    setPSaturday(source?.saturday_classes ?? true);
    setDialog(true);
  };

  // Edit an existing plan's basic details in place (PATCH, classroom stays fixed).
  const openEditDialog = (p: PlanCard) => {
    setEditingPlan(p);
    setDuplicateFrom(null);
    setPTitle(p.title);
    setPExam(p.exam_type);
    setPClassroom(p.classroom_id);
    setPStart(p.start_date);
    setPEnd(p.expected_end_date);
    setPExamDate(p.exam_date || '');
    setPSaturday(p.saturday_classes ?? true);
    setDialog(true);
  };

  const savePlan = async () => {
    setBusy(true);
    try {
      if (editingPlan) {
        await authFetch(`/api/teaching-plans/${editingPlan.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: pTitle,
            exam_type: pExam,
            start_date: pStart,
            expected_end_date: pEnd,
            saturday_classes: pSaturday,
            exam_date: pExamDate || null,
          }),
        });
        setDialog(false);
        await load();
        setSnack({ msg: 'Plan details updated', sev: 'success' });
        return;
      }
      const data = await authFetch('/api/teaching-plans', {
        method: 'POST',
        body: JSON.stringify({
          classroom_id: pClassroom,
          title: pTitle,
          exam_type: pExam,
          start_date: pStart,
          expected_end_date: pEnd,
          saturday_classes: pSaturday,
          exam_date: pExamDate || undefined,
          duplicate_from: duplicateFrom?.id,
        }),
      });
      setDialog(false);
      router.push(`/teacher/course-plans/${data.plan.id}`);
    } catch (err) {
      setSnack({
        msg: err instanceof Error ? err.message : editingPlan ? 'Failed to update plan' : 'Failed to create plan',
        sev: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  // Move a plan to the archived section (soft delete). Recoverable via restore.
  const archivePlan = async (p: PlanCard) => {
    setBusy(true);
    try {
      await authFetch(`/api/teaching-plans/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'archived' }),
      });
      setConfirm(null);
      await load();
      setSnack({ msg: 'Plan archived', sev: 'success' });
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to archive plan', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };

  // Bring an archived plan back into the working list as a Draft.
  const restorePlan = async (p: PlanCard) => {
    setBusy(true);
    try {
      await authFetch(`/api/teaching-plans/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'draft' }),
      });
      await load();
      setSnack({ msg: 'Plan restored', sev: 'success' });
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to restore plan', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };

  // Permanently remove an archived plan (cascade). Not reversible.
  const deletePlan = async (p: PlanCard) => {
    setBusy(true);
    try {
      await authFetch(`/api/teaching-plans/${p.id}`, { method: 'DELETE' });
      setConfirm(null);
      await load();
      setSnack({ msg: 'Plan deleted', sev: 'success' });
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to delete plan', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const activeOrDraft = (plans || []).filter((p) => p.status !== 'archived');
  const archived = (plans || []).filter((p) => p.status === 'archived');

  // Header summary: the current active plan and cross-plan stats.
  const activePlan = activeOrDraft.find((p) => p.status === 'active') || null;
  const activeProg = activePlan ? dayProgress(activePlan, today) : null;
  const distinctBatches = new Set((plans || []).map((p) => p.classroom_id)).size;
  const activeMeta = STATUS_META.active;

  const PlanRow = ({ p }: { p: PlanCard }) => {
    const meta = STATUS_META[p.status] || STATUS_META.draft;
    const isArchived = p.status === 'archived';
    const prog = p.status === 'active' ? dayProgress(p, today) : null;
    return (
      <Card
        elevation={0}
        sx={{
          p: 2,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 3,
          borderLeft: p.status === 'active' ? '4px solid #2E7D32' : undefined,
          opacity: isArchived ? 0.7 : 1,
        }}
      >
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography
            role="button"
            tabIndex={0}
            onClick={() => router.push(`/teacher/course-plans/${p.id}`)}
            onKeyDown={(e) => e.key === 'Enter' && router.push(`/teacher/course-plans/${p.id}`)}
            sx={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.2px', cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
          >
            {p.title}
          </Typography>
          <Chip label={meta.label} size="small" sx={{ bgcolor: meta.bg, color: meta.color, fontWeight: 700, height: 22 }} />
          <Chip label={p.exam_type.toUpperCase()} size="small" variant="outlined" sx={{ height: 22 }} />
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', fontWeight: 600 }}>
            {fmtDate(p.start_date)} → {fmtDate(p.expected_end_date)}
            {p.exam_date ? ` · exam ${fmtDate(p.exam_date)}` : ''}
          </Typography>
        </Stack>

        {prog && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.25 }}>
            <LinearProgress
              variant="determinate"
              value={Math.round((prog.day / prog.total) * 100)}
              sx={{ flex: 1, height: 7, borderRadius: 4, bgcolor: alpha('#2E7D32', 0.12), '& .MuiLinearProgress-bar': { borderRadius: 4, bgcolor: '#2E7D32' } }}
            />
            <Typography variant="caption" sx={{ fontWeight: 800, color: '#1B5E20' }}>
              Day {prog.day} of {prog.total}
            </Typography>
          </Box>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.25, flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            {p.module_count} {p.module_count === 1 ? 'subject' : 'subjects'} · {p.topic_count} {p.topic_count === 1 ? 'topic' : 'topics'} · {p.test_count} {p.test_count === 1 ? 'test' : 'tests'}
            {p.done_count ? ` · ${p.done_count} done` : ''}
          </Typography>
          <Stack direction="row" spacing={0.75} sx={{ ml: 'auto' }} flexWrap="wrap" useFlexGap>
            {isArchived ? (
              <>
                <Button size="small" startIcon={<ContentCopyOutlinedIcon sx={{ fontSize: 15 }} />} onClick={() => openDialog(p)} sx={{ minHeight: 36, fontWeight: 700 }}>
                  Duplicate as template
                </Button>
                <Button size="small" startIcon={<UnarchiveOutlinedIcon sx={{ fontSize: 16 }} />} onClick={() => restorePlan(p)} disabled={busy} sx={{ minHeight: 36, fontWeight: 700 }}>
                  Restore
                </Button>
                <Button size="small" color="error" startIcon={<DeleteOutlineIcon sx={{ fontSize: 16 }} />} onClick={() => setConfirm({ kind: 'delete', plan: p })} sx={{ minHeight: 36, fontWeight: 700 }}>
                  Delete
                </Button>
              </>
            ) : (
              <>
                <Button size="small" variant="contained" onClick={() => router.push(`/teacher/course-plans/${p.id}`)} sx={{ minHeight: 36 }}>
                  Open builder
                </Button>
                <Button size="small" variant="outlined" onClick={() => router.push(`/teacher/course-plans/${p.id}/schedule`)} sx={{ minHeight: 36 }}>
                  Schedule
                </Button>
                <Button size="small" variant="outlined" onClick={() => router.push(`/teacher/course-plans/${p.id}/health`)} sx={{ minHeight: 36 }}>
                  Health
                </Button>
                <Button size="small" color="inherit" startIcon={<EditOutlinedIcon sx={{ fontSize: 16 }} />} onClick={() => openEditDialog(p)} sx={{ minHeight: 36, color: 'text.secondary' }}>
                  Edit
                </Button>
                <Button size="small" color="inherit" startIcon={<Inventory2OutlinedIcon sx={{ fontSize: 16 }} />} onClick={() => setConfirm({ kind: 'archive', plan: p })} sx={{ minHeight: 36, color: 'text.secondary' }}>
                  Archive
                </Button>
              </>
            )}
          </Stack>
        </Box>
      </Card>
    );
  };

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        {/* Row 1: active-plan context (eyebrow, title + chip) and the progress readout */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap' }}>
          <Box sx={{ minWidth: 0 }}>
            {activePlan && (
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'text.secondary',
                  fontSize: '0.68rem',
                }}
                noWrap
              >
                {activePlan.title}
              </Typography>
            )}
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="h5" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' }, letterSpacing: '-0.3px' }}>
                Course Plans
              </Typography>
              {activePlan && (
                <Chip
                  label={activeMeta.label}
                  size="small"
                  sx={{ bgcolor: activeMeta.bg, color: activeMeta.color, fontWeight: 700, height: 22 }}
                />
              )}
            </Stack>
          </Box>

          {activePlan && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                {activeProg ? `Day ${activeProg.day} of ${activeProg.total}` : 'Not started'}
                {activePlan.exam_date ? ` · Exam ${fmtDate(activePlan.exam_date)}` : ''}
              </Typography>
              {user && (
                <Avatar
                  src={user.avatar_url || undefined}
                  sx={{ width: 30, height: 30, fontSize: '0.72rem', fontWeight: 700, bgcolor: 'primary.main' }}
                >
                  {(user.name || '?').slice(0, 2).toUpperCase()}
                </Avatar>
              )}
            </Stack>
          )}
        </Box>

        {/* Row 2: cross-plan stats and the create action */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, mt: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">
            {plans === null
              ? 'Loading plans…'
              : `${plans.length} ${plans.length === 1 ? 'plan' : 'plans'} · ${distinctBatches} ${distinctBatches === 1 ? 'batch' : 'batches'} linked`}
          </Typography>
          <Button variant="contained" size="small" startIcon={<AddIcon />} sx={{ minHeight: 40 }} onClick={() => openDialog()}>
            New course plan
          </Button>
        </Box>
      </Box>

      {plans === null ? (
        <Stack spacing={1.5} sx={{ maxWidth: 820 }}>
          {[0, 1].map((i) => (
            <Skeleton key={i} variant="rounded" height={150} sx={{ borderRadius: 3 }} />
          ))}
        </Stack>
      ) : plans.length === 0 ? (
        <EmptyState
          title="No course plans yet"
          description="Create your first plan, then add topics from the Repository and arrange them on the calendar."
          action={<Button variant="contained" onClick={() => openDialog()}>Create a plan</Button>}
        />
      ) : (
        <Stack spacing={1.5} sx={{ maxWidth: 820 }}>
          {activeOrDraft.map((p) => (
            <PlanRow key={p.id} p={p} />
          ))}
          {archived.length > 0 && (
            <>
              <Button
                onClick={() => setShowArchived((v) => !v)}
                startIcon={
                  <ExpandMoreIcon sx={{ transform: showArchived ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                }
                sx={{ alignSelf: 'flex-start', color: 'text.secondary', fontWeight: 700, minHeight: 40 }}
              >
                {showArchived ? 'Hide archived' : `Show archived (${archived.length})`}
              </Button>
              <Collapse in={showArchived} unmountOnExit>
                <Stack spacing={1.5}>
                  {archived.map((p) => (
                    <PlanRow key={p.id} p={p} />
                  ))}
                </Stack>
              </Collapse>
            </>
          )}
        </Stack>
      )}

      <Dialog open={dialog} onClose={() => !busy && setDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {editingPlan ? `Edit “${editingPlan.title}”` : duplicateFrom ? `Duplicate “${duplicateFrom.title}”` : 'New course plan'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {duplicateFrom && (
              <Typography variant="caption" color="text.secondary">
                Copies the whole queue ({duplicateFrom.entry_count} entries) with fresh dates. Coverage resets; re-pin the tests.
              </Typography>
            )}
            <TextField label="Plan title" value={pTitle} onChange={(e) => setPTitle(e.target.value)} autoFocus fullWidth placeholder="e.g. NATA 2027 Crash Batch A" />
            <Stack direction="row" spacing={1.5}>
              <TextField select label="Exam" value={pExam} onChange={(e) => setPExam(e.target.value)} fullWidth>
                {EXAM_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
              {!editingPlan && (
                <TextField select label="Classroom" value={pClassroom} onChange={(e) => setPClassroom(e.target.value)} fullWidth>
                  {(classrooms || []).map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            </Stack>
            <Stack direction="row" spacing={1.5}>
              <TextField label="Start date" type="date" value={pStart} onChange={(e) => setPStart(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
              <TextField label="Expected completion" type="date" value={pEnd} onChange={(e) => setPEnd(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
            </Stack>
            <TextField label="Exam date (optional)" type="date" value={pExamDate} onChange={(e) => setPExamDate(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
            <FormControlLabel
              control={<Switch checked={pSaturday} onChange={(e) => setPSaturday(e.target.checked)} />}
              label={<Typography sx={{ fontWeight: 600, fontSize: '0.88rem' }}>Saturday classes</Typography>}
            />
            {editingPlan?.status === 'active' &&
              (pStart !== editingPlan.start_date || pEnd !== editingPlan.expected_end_date || pSaturday !== (editingPlan.saturday_classes ?? true)) && (
                <Alert severity="warning">
                  This plan is <strong>Active</strong>. Changing the dates or Saturday classes re-flows all upcoming classes on the calendar.
                </Alert>
              )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialog(false)} disabled={busy}>Cancel</Button>
          <Button variant="contained" onClick={savePlan} disabled={busy || !pTitle.trim() || (!editingPlan && !pClassroom) || !pStart || !pEnd}>
            {editingPlan ? 'Save changes' : duplicateFrom ? 'Duplicate plan' : 'Create plan'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!confirm} onClose={() => !busy && setConfirm(null)} maxWidth="xs" fullWidth>
        {confirm?.kind === 'archive' ? (
          <>
            <DialogTitle>Archive “{confirm.plan.title}”?</DialogTitle>
            <DialogContent>
              <Stack spacing={1.5} sx={{ mt: 0.5 }}>
                {confirm.plan.status === 'active' && (
                  <Alert severity="warning">
                    This is the <strong>active</strong> plan driving a live batch. Archiving stops it from showing in your working list.
                  </Alert>
                )}
                <Typography variant="body2" color="text.secondary">
                  It moves to the archived section, hidden from your working list. You can restore it any time, or delete it permanently later.
                </Typography>
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setConfirm(null)} disabled={busy}>Cancel</Button>
              <Button variant="contained" color="warning" onClick={() => archivePlan(confirm.plan)} disabled={busy}>
                {confirm.plan.status === 'active' ? 'Yes, archive the active plan' : 'Archive plan'}
              </Button>
            </DialogActions>
          </>
        ) : confirm?.kind === 'delete' ? (
          <>
            <DialogTitle>Delete “{confirm.plan.title}” permanently?</DialogTitle>
            <DialogContent>
              <Stack spacing={1.5} sx={{ mt: 0.5 }}>
                <Alert severity="error">
                  This cannot be undone. The plan and all its topics, tests and history are removed. Scheduled classes are kept, they just unlink from this plan.
                </Alert>
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setConfirm(null)} disabled={busy}>Cancel</Button>
              <Button variant="contained" color="error" onClick={() => deletePlan(confirm.plan)} disabled={busy}>
                Delete permanently
              </Button>
            </DialogActions>
          </>
        ) : null}
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={3500} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack?.sev || 'success'} onClose={() => setSnack(null)}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
