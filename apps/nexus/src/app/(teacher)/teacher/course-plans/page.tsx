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
  alpha,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
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

  const [dialog, setDialog] = useState(false);
  const [pTitle, setPTitle] = useState('');
  const [pExam, setPExam] = useState('nata');
  const [pClassroom, setPClassroom] = useState('');
  const [pStart, setPStart] = useState('');
  const [pEnd, setPEnd] = useState('');
  const [pExamDate, setPExamDate] = useState('');
  const [pSaturday, setPSaturday] = useState(true);
  const [duplicateFrom, setDuplicateFrom] = useState<PlanCard | null>(null);

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

  const createPlan = async () => {
    setBusy(true);
    try {
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
      setSnack({ msg: err instanceof Error ? err.message : 'Failed to create plan', sev: 'error' });
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
            {p.module_count} {p.module_count === 1 ? 'module' : 'modules'} · {p.topic_count} {p.topic_count === 1 ? 'topic' : 'topics'} · {p.test_count} {p.test_count === 1 ? 'test' : 'tests'}
            {p.done_count ? ` · ${p.done_count} done` : ''}
          </Typography>
          <Stack direction="row" spacing={0.75} sx={{ ml: 'auto' }} flexWrap="wrap" useFlexGap>
            {isArchived ? (
              <Button size="small" startIcon={<ContentCopyOutlinedIcon sx={{ fontSize: 15 }} />} onClick={() => openDialog(p)} sx={{ minHeight: 36, fontWeight: 700 }}>
                Duplicate as template
              </Button>
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
          {archived.map((p) => (
            <PlanRow key={p.id} p={p} />
          ))}
        </Stack>
      )}

      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{duplicateFrom ? `Duplicate “${duplicateFrom.title}”` : 'New course plan'}</DialogTitle>
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
              <TextField select label="Classroom" value={pClassroom} onChange={(e) => setPClassroom(e.target.value)} fullWidth>
                {(classrooms || []).map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextField>
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
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={createPlan} disabled={busy || !pTitle.trim() || !pClassroom || !pStart || !pEnd}>
            {duplicateFrom ? 'Duplicate plan' : 'Create plan'}
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
