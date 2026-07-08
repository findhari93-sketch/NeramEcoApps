'use client';

/**
 * Shared frame for every screen of one course plan: header (title, status,
 * dates, Activate, History), the Builder | Schedule | Class Day | Health |
 * Catch-up sub-nav, the plan history drawer and the snackbar.
 *
 * Mobile gets scrollable top tabs (the app's bottom nav already belongs to
 * PanelProvider, so no second bottom bar).
 */
import { ReactNode, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Chip,
  Button,
  IconButton,
  Skeleton,
  Tabs,
  Tab,
  Stack,
  Snackbar,
  Alert,
  Drawer,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  alpha,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { PLAN_STATUS, fmtShort, type PlanData } from './common';
import type { UsePlanData } from './usePlanData';

const EXAM_OPTIONS = [
  { value: 'nata', label: 'NATA' },
  { value: 'jee', label: 'JEE' },
  { value: 'foundation', label: 'Foundation' },
  { value: 'custom', label: 'Custom' },
];

const SUBNAV: { key: string; label: string; path: string }[] = [
  { key: 'builder', label: 'Builder', path: '' },
  { key: 'schedule', label: 'Schedule', path: '/schedule' },
  { key: 'classday', label: 'Class Day', path: '/class-day' },
  { key: 'health', label: 'Health', path: '/health' },
  { key: 'catchup', label: 'Catch-up', path: '/catchup' },
];

export function HistoryFeed({ audit }: { audit: PlanData['audit'] }) {
  if (!audit.length) {
    return (
      <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', py: 4 }}>
        No activity yet
      </Typography>
    );
  }
  return (
    <>
      {audit.map((a) => {
        const md = (a.metadata || {}) as {
          summary?: string;
          from?: string;
          to?: string;
          date?: string;
          time?: string;
          continuation_on?: string;
        };
        return (
          <Box
            key={a.id}
            sx={{ display: 'flex', gap: 1.5, py: 1.5, borderBottom: '1px solid', borderColor: alpha('#000', 0.05) }}
          >
            <Avatar
              src={a.performer?.avatar_url || undefined}
              sx={{ width: 30, height: 30, fontSize: '0.7rem', bgcolor: 'primary.dark' }}
            >
              {(a.performer?.name || '?').slice(0, 2).toUpperCase()}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2">
                <strong>{a.performer?.name || 'Someone'}</strong> {md.summary || a.action}
              </Typography>
              {(md.from || md.to || md.date) && (
                <Stack
                  direction="row"
                  spacing={0.5}
                  alignItems="center"
                  sx={{ mt: 0.5, px: 1, py: 0.4, borderRadius: 1.5, bgcolor: alpha('#1A2027', 0.045), width: 'fit-content' }}
                >
                  <SwapHorizOutlinedIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
                  <Typography variant="caption" color="text.secondary">
                    {md.date
                      ? `${md.date}${md.time ? `, ${md.time}` : ''}`
                      : md.from && md.to
                        ? `${md.from} to ${md.to}`
                        : md.from || md.to}
                  </Typography>
                </Stack>
              )}
            </Box>
            <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap' }}>
              {new Date(a.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{' '}
              {new Date(a.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
            </Typography>
          </Box>
        );
      })}
    </>
  );
}

export default function PlanShell({
  planId,
  active,
  planData,
  children,
}: {
  planId: string;
  active: 'builder' | 'schedule' | 'classday' | 'health' | 'catchup';
  planData: UsePlanData;
  children: ReactNode;
}) {
  const router = useRouter();
  const { data, plan, flow, today, busy, loadError, snack, setSnack, patch, load } = planData;
  const { signIn } = useNexusAuthContext();
  const [historyOpen, setHistoryOpen] = useState(false);

  // Edit basic details (title / exam / dates). Backend PATCH already supports these.
  const [editOpen, setEditOpen] = useState(false);
  const [eTitle, setETitle] = useState('');
  const [eExam, setEExam] = useState('nata');
  const [eStart, setEStart] = useState('');
  const [eEnd, setEEnd] = useState('');

  const openEdit = () => {
    if (!plan) return;
    setETitle(plan.title);
    setEExam(plan.exam_type);
    setEStart(plan.start_date);
    setEEnd(plan.expected_end_date);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!plan || !eTitle.trim() || !eStart || !eEnd) return;
    const updates: Record<string, unknown> = {};
    if (eTitle.trim() !== plan.title) updates.title = eTitle.trim();
    if (eExam !== plan.exam_type) updates.exam_type = eExam;
    if (eStart !== plan.start_date) updates.start_date = eStart;
    if (eEnd !== plan.expected_end_date) updates.expected_end_date = eEnd;
    if (Object.keys(updates).length === 0) {
      setEditOpen(false);
      return;
    }
    const ok = await patch(updates, 'Plan details updated.');
    if (ok) setEditOpen(false);
  };

  // Warn only when an active plan's schedule-driving dates change (re-flows classes).
  const datesChanged = !!plan && (eStart !== plan.start_date || eEnd !== plan.expected_end_date);

  const dayProgress = useMemo(() => {
    if (!flow || !flow.days.length) return null;
    const classDays = flow.days.filter((d) => !d.isTest);
    if (!classDays.length) return null;
    const passed = classDays.filter((d) => d.date <= today).length;
    return { day: Math.max(1, Math.min(passed, classDays.length)), total: classDays.length };
  }, [flow, today]);

  if (!data || !plan) {
    // A load failure must not look like loading forever: show what went wrong
    // and the way out (retry, re-sign-in for stale Microsoft sessions, back).
    if (loadError) {
      const sessionExpired = /session expired|not authenticated|sign in/i.test(loadError);
      const notFound = /not found/i.test(loadError);
      return (
        <Box
          sx={{
            maxWidth: 480,
            mx: 'auto',
            mt: { xs: 6, md: 10 },
            p: 3,
            borderRadius: 3,
            border: '1px solid',
            borderColor: alpha('#C62828', 0.25),
            bgcolor: alpha('#C62828', 0.04),
            textAlign: 'center',
          }}
        >
          <ErrorOutlineIcon sx={{ fontSize: 40, color: 'error.main', mb: 1 }} />
          <Typography sx={{ fontWeight: 700, fontSize: '1.05rem' }}>
            {notFound
              ? 'This plan is no longer available'
              : sessionExpired
                ? 'Your session has expired'
                : "Couldn't load this plan"}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {notFound
              ? 'It may have been deleted. Pick a plan from the Course Plans list.'
              : loadError}
          </Typography>
          <Stack direction="row" spacing={1.5} justifyContent="center" sx={{ mt: 2.5 }}>
            {sessionExpired ? (
              <Button variant="contained" onClick={() => signIn()} sx={{ minHeight: 44 }}>
                Sign in again
              </Button>
            ) : !notFound ? (
              <Button variant="contained" startIcon={<RefreshIcon />} onClick={() => load()} sx={{ minHeight: 44 }}>
                Try again
              </Button>
            ) : null}
            <Button
              variant="outlined"
              startIcon={<ArrowBackIcon />}
              onClick={() => router.push('/teacher/course-plans')}
              sx={{ minHeight: 44 }}
            >
              Course Plans
            </Button>
          </Stack>
        </Box>
      );
    }
    return (
      <Box>
        <Skeleton width={160} height={32} />
        <Skeleton variant="rounded" height={80} sx={{ mt: 2, borderRadius: 3 }} />
        <Skeleton variant="rounded" height={400} sx={{ mt: 2, borderRadius: 3 }} />
      </Box>
    );
  }

  const planMeta = PLAN_STATUS[plan.status] || PLAN_STATUS.draft;

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.push('/teacher/course-plans')}
        sx={{ mb: 1, minHeight: 44, color: 'text.secondary', fontWeight: 600 }}
      >
        Course Plans
      </Button>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
        <Typography variant="h5" sx={{ fontSize: { xs: '1.2rem', sm: '1.4rem' }, letterSpacing: '-0.3px' }}>
          {plan.title}
        </Typography>
        <IconButton
          size="small"
          aria-label="Edit plan details"
          onClick={openEdit}
          sx={{ width: 32, height: 32, color: 'text.secondary' }}
        >
          <EditOutlinedIcon sx={{ fontSize: 18 }} />
        </IconButton>
        <Chip
          label={planMeta.label}
          size="small"
          sx={{ bgcolor: planMeta.bg, color: planMeta.color, fontWeight: 700, height: 22 }}
        />
        <Chip label={plan.exam_type.toUpperCase()} size="small" variant="outlined" sx={{ height: 22 }} />
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<HistoryOutlinedIcon />}
            onClick={() => setHistoryOpen(true)}
            sx={{ minHeight: 36 }}
          >
            History ({data.audit.length})
          </Button>
          {plan.status === 'draft' && (
            <Button
              variant="contained"
              size="small"
              disabled={busy}
              onClick={() => patch({ status: 'active' }, 'Plan is now Active. Changes from here on are logged.')}
              sx={{ minHeight: 36 }}
            >
              Activate plan
            </Button>
          )}
        </Box>
      </Box>
      <Typography variant="body2" color="text.secondary">
        {fmtShort(plan.start_date)} to {fmtShort(plan.expected_end_date)}
        {plan.exam_date ? ` · exam ${fmtShort(plan.exam_date)}` : ''}
        {dayProgress && plan.status === 'active' ? ` · Day ${dayProgress.day} of ${dayProgress.total}` : ''}
      </Typography>

      <Tabs
        value={SUBNAV.findIndex((s) => s.key === active)}
        onChange={(_, v) => router.push(`/teacher/course-plans/${planId}${SUBNAV[v].path}`)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ borderBottom: 1, borderColor: 'divider', mt: 1.5, mb: 2 }}
      >
        {SUBNAV.map((s) => (
          <Tab key={s.key} label={s.label} sx={{ minHeight: 44 }} />
        ))}
      </Tabs>

      {children}

      <Dialog open={editOpen} onClose={() => !busy && setEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit plan details</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField
              label="Plan title"
              value={eTitle}
              onChange={(e) => setETitle(e.target.value)}
              autoFocus
              fullWidth
              placeholder="e.g. JEE B.Arch Session 1 2027"
            />
            <TextField select label="Exam" value={eExam} onChange={(e) => setEExam(e.target.value)} fullWidth>
              {EXAM_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
            <Stack direction="row" spacing={1.5}>
              <TextField
                label="Start date"
                type="date"
                value={eStart}
                onChange={(e) => setEStart(e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Expected completion"
                type="date"
                value={eEnd}
                onChange={(e) => setEEnd(e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
            {plan.status === 'active' && datesChanged && (
              <Alert severity="warning" sx={{ py: 0.5 }}>
                This plan is <strong>Active</strong>. Changing the dates re-flows all upcoming classes on the calendar.
              </Alert>
            )}
            <Typography variant="caption" color="text.secondary">
              To change Saturday classes or the exam date, use <strong>Schedule settings</strong> on the Builder.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="contained" onClick={saveEdit} disabled={busy || !eTitle.trim() || !eStart || !eEnd}>
            Save changes
          </Button>
        </DialogActions>
      </Dialog>

      <Drawer
        anchor="right"
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 400 }, p: 2 } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '1.05rem' }}>Plan history</Typography>
          <Button onClick={() => setHistoryOpen(false)} sx={{ ml: 'auto', minWidth: 44, minHeight: 44 }}>
            Close
          </Button>
        </Box>
        {plan.status === 'active' && (
          <Box
            sx={{
              p: 1.25,
              mb: 1.5,
              borderRadius: 2.5,
              bgcolor: alpha('#F9A825', 0.12),
              border: `1px solid ${alpha('#F9A825', 0.35)}`,
            }}
          >
            <Typography variant="caption" sx={{ color: '#7a5410', fontWeight: 600 }}>
              Active plan: past classes are locked. Edits apply forward and are visible to all collaborators.
            </Typography>
          </Box>
        )}
        <HistoryFeed audit={data.audit} />
      </Drawer>

      <Snackbar
        open={!!snack}
        autoHideDuration={3500}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack?.sev || 'success'} onClose={() => setSnack(null)}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
