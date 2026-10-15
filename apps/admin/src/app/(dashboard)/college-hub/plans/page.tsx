'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import BlockIcon from '@mui/icons-material/Block';
import HistoryIcon from '@mui/icons-material/History';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import CloseIcon from '@mui/icons-material/Close';
import AddLinkIcon from '@mui/icons-material/AddLink';
import { useMicrosoftAuth } from '@neram/auth';
import CollegeSearchField, { type CollegeSearchOption } from '@/components/college-hub/CollegeSearchField';
import { HubPageHeader, TableSkeletonRows, TierChip, formatDate, formatDateTime } from '@/components/college-hub/hub-ui';
import {
  PLAN_STATE_LABEL,
  PLAN_TIERS,
  PRESET_LABEL,
  TIER_LABEL,
  TIER_SUMMARY,
  addMonths,
  daysLeft,
  formatPlanAmount,
  planState,
  presetEndDate,
  todayIST,
  type PlanFilter,
  type PlanPreset,
  type PlanState,
  type PlanTier,
} from '@/lib/college-plans/helpers';

interface PlanCollege {
  id: string;
  name: string;
  slug: string | null;
  state_slug: string | null;
  city: string | null;
}

interface PlanRow {
  id: string;
  college_id: string;
  tier: PlanTier;
  starts_on: string;
  ends_on: string;
  amount: number;
  status: 'active' | 'revoked' | 'ended';
  notes: string | null;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  college: PlanCollege | null;
  account_count?: number;
}

const FILTER_LABEL: Record<PlanFilter, string> = {
  all: 'All',
  active: 'Active',
  expiring: 'Expiring in 30 days',
  ended: 'Ended',
  revoked: 'Revoked',
};

const STATE_COLOR: Record<PlanState, 'success' | 'warning' | 'default' | 'error' | 'info'> = {
  scheduled: 'info',
  active: 'success',
  expiring: 'warning',
  ended: 'default',
  revoked: 'error',
};

type Dialogs =
  | { kind: 'give' }
  | { kind: 'extend'; plan: PlanRow }
  | { kind: 'tier'; plan: PlanRow }
  | { kind: 'revoke'; plan: PlanRow }
  | null;

function useStaff() {
  const { user } = useMicrosoftAuth();
  return { staff_name: user?.name || user?.email || undefined, staff_email: user?.email || undefined };
}

async function send(url: string, method: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((json.error as string) || `Request failed (${res.status})`);
  return json;
}

function TierSelect({ value, onChange, label = 'Tier' }: { value: PlanTier; onChange: (t: PlanTier) => void; label?: string }) {
  return (
    <FormControl fullWidth size="small">
      <InputLabel id="plan-tier-label">{label}</InputLabel>
      <Select
        labelId="plan-tier-label"
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as PlanTier)}
        renderValue={(v) => TIER_LABEL[v as PlanTier]}
      >
        {PLAN_TIERS.map((t) => (
          <MenuItem key={t} value={t} sx={{ alignItems: 'flex-start', flexDirection: 'column', whiteSpace: 'normal' }}>
            <Typography variant="body2" fontWeight={600}>
              {TIER_LABEL[t]}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {TIER_SUMMARY[t]}
            </Typography>
          </MenuItem>
        ))}
      </Select>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75 }}>
        {TIER_SUMMARY[value]}
      </Typography>
    </FormControl>
  );
}

function GivePlanDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const staff = useStaff();
  const today = todayIST();
  const [college, setCollege] = useState<CollegeSearchOption | null>(null);
  const [tier, setTier] = useState<PlanTier>('gold');
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(presetEndDate('season', today));
  const [amount, setAmount] = useState('0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const t = todayIST();
    setCollege(null);
    setTier('gold');
    setStartsOn(t);
    setEndsOn(presetEndDate('season', t));
    setAmount('0');
    setNotes('');
    setError('');
  }, [open]);

  const submit = async () => {
    if (!college) return setError('Choose a college.');
    if (!endsOn) return setError('Choose an end date.');
    setSaving(true);
    setError('');
    try {
      await send('/api/college-hub/plans', 'POST', {
        college_id: college.id,
        tier,
        starts_on: startsOn,
        ends_on: endsOn,
        amount: amount === '' ? 0 : Number(amount),
        notes,
        ...staff,
      });
      onDone(`${college.name} now has a ${TIER_LABEL[tier]} plan until ${formatDate(endsOn)}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle>Give plan</DialogTitle>
      <DialogContent>
        <Stack gap={2.5} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <CollegeSearchField label="College" required value={college} onChange={setCollege} />
          <TierSelect value={tier} onChange={setTier} />
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
            <TextField
              label="Start date"
              type="date"
              size="small"
              fullWidth
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="End date"
              type="date"
              size="small"
              fullWidth
              required
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
          <Stack direction="row" gap={1} flexWrap="wrap" aria-label="End date presets">
            {(Object.keys(PRESET_LABEL) as PlanPreset[]).map((p) => {
              const end = presetEndDate(p, startsOn || today);
              return (
                <Chip
                  key={p}
                  label={`${PRESET_LABEL[p]}: ${formatDate(end)}`}
                  onClick={() => setEndsOn(end)}
                  color={endsOn === end ? 'primary' : 'default'}
                  variant={endsOn === end ? 'filled' : 'outlined'}
                  sx={{ minHeight: 36 }}
                />
              );
            })}
          </Stack>
          <TextField
            label="Amount"
            type="number"
            size="small"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputProps={{ min: 0, step: 1000 }}
            InputProps={{ startAdornment: <InputAdornment position="start">Rs</InputAdornment> }}
            helperText="0 for a free trial."
          />
          <TextField
            label="Note"
            size="small"
            multiline
            minRows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            helperText='For example "Pilot" or the invoice number.'
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={saving || !college}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {saving ? 'Saving...' : 'Give plan'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ExtendDialog({ plan, onClose, onDone }: { plan: PlanRow; onClose: () => void; onDone: (msg: string) => void }) {
  const [endsOn, setEndsOn] = useState(plan.ends_on);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const presets: { label: string; end: string }[] = [
    { label: '1 more month', end: addMonths(plan.ends_on, 1) },
    { label: 'To next 31 Aug', end: presetEndDate('season', nextDay(plan.ends_on)) },
    { label: '1 more year', end: addMonths(plan.ends_on, 12) },
  ];

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await send(`/api/college-hub/plans/${plan.id}`, 'PATCH', { action: 'extend', ends_on: endsOn });
      onDone(`Plan for ${plan.college?.name ?? 'the college'} now ends on ${formatDate(endsOn)}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={() => !saving && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>Extend plan</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2" color="text.secondary">
            {plan.college?.name}: {TIER_LABEL[plan.tier]}, now ends {formatDate(plan.ends_on)}.
          </Typography>
          <TextField
            label="New end date"
            type="date"
            size="small"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Stack direction="row" gap={1} flexWrap="wrap">
            {presets.map((p) => (
              <Chip
                key={p.label}
                label={`${p.label}: ${formatDate(p.end)}`}
                onClick={() => setEndsOn(p.end)}
                color={endsOn === p.end ? 'primary' : 'default'}
                variant={endsOn === p.end ? 'filled' : 'outlined'}
                sx={{ minHeight: 36 }}
              />
            ))}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={saving || endsOn === plan.ends_on || !endsOn}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {saving ? 'Saving...' : 'Save end date'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function ChangeTierDialog({ plan, onClose, onDone }: { plan: PlanRow; onClose: () => void; onDone: (msg: string) => void }) {
  const [tier, setTier] = useState<PlanTier>(plan.tier);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await send(`/api/college-hub/plans/${plan.id}`, 'PATCH', { action: 'change_tier', tier });
      onDone(`${plan.college?.name ?? 'The college'} is now on ${TIER_LABEL[tier]}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={() => !saving && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>Change tier</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2" color="text.secondary">
            {plan.college?.name}. Dates and amount stay the same.
          </Typography>
          <TierSelect value={tier} onChange={setTier} label="New tier" />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={saving || tier === plan.tier}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {saving ? 'Saving...' : 'Change tier'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function RevokeDialog({ plan, onClose, onDone }: { plan: PlanRow; onClose: () => void; onDone: (msg: string) => void }) {
  const staff = useStaff();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!reason.trim()) return setError('Give a reason for revoking.');
    setSaving(true);
    setError('');
    try {
      await send(`/api/college-hub/plans/${plan.id}`, 'PATCH', { action: 'revoke', reason, ...staff });
      onDone(`Plan revoked. ${plan.college?.name ?? 'The college'} is back on the free listing.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={() => !saving && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle>Revoke plan for {plan.college?.name}</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Alert severity="warning">
            Paid features switch off on the public page and the college sees its plan has ended. Their logins keep working.
          </Alert>
          <TextField
            label="Reason"
            required
            size="small"
            multiline
            minRows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            helperText="Kept in the plan history. The college does not see it."
            autoFocus
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={submit}
          disabled={saving || !reason.trim()}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {saving ? 'Revoking...' : 'Revoke plan'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function HistoryDrawer({ college, onClose }: { college: PlanCollege | null; onClose: () => void }) {
  const [rows, setRows] = useState<PlanRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!college) return;
    setRows(null);
    setError('');
    fetch(`/api/college-hub/plans/history?college_id=${college.id}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Could not load history');
        setRows(j.plans ?? []);
      })
      .catch((e: Error) => setError(e.message));
  }, [college]);

  const today = todayIST();
  return (
    <Drawer anchor="right" open={Boolean(college)} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 440 } } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 2 }}>
        <Box>
          <Typography variant="h6" component="h2">
            Plan history
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {college?.name}
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Close plan history" sx={{ width: 44, height: 44 }}>
          <CloseIcon />
        </IconButton>
      </Stack>
      <Divider />
      <Box sx={{ p: 2, overflowY: 'auto' }}>
        {error && <Alert severity="error">{error}</Alert>}
        {!rows && !error && (
          <Stack gap={1.5}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="rounded" height={96} />
            ))}
          </Stack>
        )}
        {rows && rows.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            This college has never had a plan.
          </Typography>
        )}
        <Stack gap={1.5}>
          {rows?.map((p) => {
            const state = planState(p, today);
            return (
              <Paper key={p.id} variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                  <TierChip tier={p.tier} />
                  <Chip size="small" label={PLAN_STATE_LABEL[state]} color={STATE_COLOR[state]} variant="outlined" />
                  <Typography variant="body2" sx={{ ml: 'auto' }}>
                    {formatPlanAmount(p.amount)}
                  </Typography>
                </Stack>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {formatDate(p.starts_on)} to {formatDate(p.ends_on)}
                </Typography>
                <Typography variant="caption" color="text.secondary" component="div">
                  Given by {p.created_by || 'unknown'} on {formatDateTime(p.created_at)}
                </Typography>
                {p.notes && (
                  <Typography variant="caption" color="text.secondary" component="div">
                    Note: {p.notes}
                  </Typography>
                )}
                {p.status === 'revoked' && (
                  <Typography variant="caption" color="error.main" component="div">
                    Revoked by {p.revoked_by || 'unknown'} on {formatDateTime(p.revoked_at)}: {p.revoke_reason}
                  </Typography>
                )}
              </Paper>
            );
          })}
        </Stack>
      </Box>
    </Drawer>
  );
}

function PilotHelp() {
  return (
    <Accordion variant="outlined" disableGutters sx={{ mb: 2, borderRadius: 1, '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-controls="pilot-help" id="pilot-help-header" sx={{ minHeight: 48 }}>
        <Stack direction="row" gap={1} alignItems="center">
          <HelpOutlineIcon color="primary" fontSize="small" />
          <Typography fontWeight={600}>How to run a college pilot</Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails id="pilot-help">
        <Box component="ol" sx={{ m: 0, pl: 2.5, '& li': { mb: 1 } }}>
          <li>
            <Typography variant="body2">
              <strong>Give plan:</strong> choose the college, Gold, a season trial, amount 0, note &quot;Pilot&quot;.
            </Typography>
          </li>
          <li>
            <Typography variant="body2">
              <strong>
                <Link href="/college-hub/accounts">Accounts</Link> &gt; Invite:
              </strong>{' '}
              add the principal as Owner. They get an email link and set a password. They can invite their own team from their
              dashboard Team page, or you add more people here.
            </Typography>
          </li>
          <li>
            <Typography variant="body2">
              The college edits fees, photos and details. Approve them in{' '}
              <Link href="/college-hub/content-reviews">Content reviews</Link>.
            </Typography>
          </li>
          <li>
            <Typography variant="body2">
              <strong>To stop:</strong> Plans &gt; the college &gt; Revoke, with a reason.
            </Typography>
          </li>
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}

export default function CollegePlansPage() {
  const [filter, setFilter] = useState<PlanFilter>('active');
  const [tier, setTier] = useState<PlanTier | ''>('');
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [counts, setCounts] = useState<Record<PlanFilter, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [history, setHistory] = useState<PlanCollege | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; plan: PlanRow } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ status: filter });
      if (tier) qs.set('tier', tier);
      const res = await fetch(`/api/college-hub/plans?${qs}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not load plans');
      setRows(j.plans ?? []);
      setCounts(j.counts ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filter, tier]);

  useEffect(() => {
    load();
  }, [load]);

  const done = (msg: string) => {
    setDialog(null);
    setToast(msg);
    load();
  };

  const today = useMemo(() => todayIST(), []);
  const menuPlan = menu?.plan;
  const menuActive = menuPlan?.status === 'active';

  return (
    <Box>
      <HubPageHeader
        icon={<WorkspacePremiumIcon />}
        title="Plans"
        description={
          <>
            A plan gives a college a paid tier between two dates. While it runs, the paid sections show on the public college
            page and the college dashboard unlocks the matching features. When it ends or is revoked the college drops to the
            free listing automatically. One college has one active plan at a time.{' '}
            <Link href="/college-hub/tiers">See what each tier includes</Link>.
          </>
        }
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ kind: 'give' })} sx={{ minHeight: 44 }}>
            Give plan
          </Button>
        }
      />

      <PilotHelp />

      <Stack direction={{ xs: 'column', md: 'row' }} gap={2} alignItems={{ md: 'center' }} justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" gap={1} flexWrap="wrap" role="group" aria-label="Filter plans by status">
          {(Object.keys(FILTER_LABEL) as PlanFilter[]).map((f) => (
            <Chip
              key={f}
              label={counts ? `${FILTER_LABEL[f]} (${counts[f]})` : FILTER_LABEL[f]}
              onClick={() => setFilter(f)}
              color={filter === f ? 'primary' : 'default'}
              variant={filter === f ? 'filled' : 'outlined'}
              aria-pressed={filter === f}
              sx={{ minHeight: 36 }}
            />
          ))}
        </Stack>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="tier-filter-label">Tier</InputLabel>
          <Select labelId="tier-filter-label" label="Tier" value={tier} onChange={(e) => setTier(e.target.value as PlanTier | '')}>
            <MenuItem value="">All tiers</MenuItem>
            {PLAN_TIERS.map((t) => (
              <MenuItem key={t} value={t}>
                {TIER_LABEL[t]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={load}>Retry</Button>}>
          {error}
        </Alert>
      )}

      <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 980 }}>
          <TableHead>
            <TableRow>
              <TableCell>College</TableCell>
              <TableCell>Tier</TableCell>
              <TableCell>Starts</TableCell>
              <TableCell>Ends</TableCell>
              <TableCell align="right">Days left</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell align="right">Accounts</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">
                <Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
                  Actions
                </Box>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && <TableSkeletonRows cols={9} />}
            {!loading &&
              rows.map((p) => {
                const state = planState(p, today);
                const left = daysLeft(p, today);
                const running = state === 'active' || state === 'expiring' || state === 'scheduled';
                return (
                  <TableRow key={p.id} hover>
                    <TableCell sx={{ maxWidth: 280 }}>
                      <Typography variant="body2" fontWeight={600}>
                        {p.college?.name ?? 'Unknown college'}
                      </Typography>
                      {p.college?.city && (
                        <Typography variant="caption" color="text.secondary">
                          {p.college.city}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <TierChip tier={p.tier} />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(p.starts_on)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(p.ends_on)}</TableCell>
                    <TableCell align="right">
                      {running ? (left === 0 ? 'Last day' : left) : <Typography variant="caption" color="text.secondary">None</Typography>}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {formatPlanAmount(p.amount)}
                    </TableCell>
                    <TableCell align="right">{p.account_count ?? 0}</TableCell>
                    <TableCell>
                      <Chip size="small" label={PLAN_STATE_LABEL[state]} color={STATE_COLOR[state]} variant="outlined" />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        aria-label={`Actions for ${p.college?.name ?? 'plan'}`}
                        onClick={(e) => setMenu({ anchor: e.currentTarget, plan: p })}
                        sx={{ width: 44, height: 44 }}
                      >
                        <MoreVertIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            {!loading && !error && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} sx={{ py: 6, textAlign: 'center' }}>
                  <Typography color="text.secondary">
                    No {filter === 'all' ? '' : FILTER_LABEL[filter].toLowerCase()} plans{tier ? ` on ${TIER_LABEL[tier]}` : ''}.
                  </Typography>
                  <Button sx={{ mt: 1 }} startIcon={<AddIcon />} onClick={() => setDialog({ kind: 'give' })}>
                    Give plan
                  </Button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)}>
        {menuActive && menuPlan && [
          <MenuItem key="extend" onClick={() => { setDialog({ kind: 'extend', plan: menuPlan }); setMenu(null); }} sx={{ minHeight: 44 }}>
            <ListItemIcon><EventRepeatIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Extend</ListItemText>
          </MenuItem>,
          <MenuItem key="tier" onClick={() => { setDialog({ kind: 'tier', plan: menuPlan }); setMenu(null); }} sx={{ minHeight: 44 }}>
            <ListItemIcon><SwapVertIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Change tier</ListItemText>
          </MenuItem>,
          <MenuItem key="revoke" onClick={() => { setDialog({ kind: 'revoke', plan: menuPlan }); setMenu(null); }} sx={{ minHeight: 44, color: 'error.main' }}>
            <ListItemIcon><BlockIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText>Revoke</ListItemText>
          </MenuItem>,
        ]}
        <MenuItem
          onClick={() => {
            if (menuPlan) setHistory(menuPlan.college ?? { id: menuPlan.college_id, name: 'College', slug: null, state_slug: null, city: null });
            setMenu(null);
          }}
          sx={{ minHeight: 44 }}
        >
          <ListItemIcon><HistoryIcon fontSize="small" /></ListItemIcon>
          <ListItemText>View history</ListItemText>
        </MenuItem>
        {menuPlan && (
          <MenuItem
            component={Link}
            href={`/college-hub/update-links?college_id=${menuPlan.college_id}`}
            onClick={() => setMenu(null)}
            sx={{ minHeight: 44 }}
          >
            <ListItemIcon><AddLinkIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Send update link</ListItemText>
          </MenuItem>
        )}
      </Menu>

      <GivePlanDialog open={dialog?.kind === 'give'} onClose={() => setDialog(null)} onDone={done} />
      {dialog?.kind === 'extend' && <ExtendDialog plan={dialog.plan} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'tier' && <ChangeTierDialog plan={dialog.plan} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'revoke' && <RevokeDialog plan={dialog.plan} onClose={() => setDialog(null)} onDone={done} />}
      <HistoryDrawer college={history} onClose={() => setHistory(null)} />

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={5000}
        onClose={() => setToast('')}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
