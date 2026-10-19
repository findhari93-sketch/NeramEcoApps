'use client';

/**
 * Auto-archive on the People page (migration 20261209090100).
 *
 * A nightly job archives quiet leads (earlier seasons after 90 quiet days,
 * anyone after 180) and brings back anyone it archived who became active again.
 * Archive is CRM-only: people can still sign in everywhere. This bar says what
 * the job did last, what it would do now, and lets staff preview, run it, turn
 * it on or off, and undo single people from the log.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  FormControlLabel,
  IconButton,
  Skeleton,
  Snackbar,
  Alert,
  Typography,
  alpha,
} from '@neram/ui';
import type { Theme } from '@mui/material/styles';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import CloseIcon from '@mui/icons-material/Close';
import type { AutoArchiveCandidate, PeopleAutoArchiveRun } from '@neram/database';
import { formatCount } from '@/lib/people-summary';

interface Status {
  enabled: boolean;
  rules: { earlier_season_idle_days: number; lead_archive_days: number };
  preview: { total: number; byRule: { earlier_season: number; long_quiet: number }; sample: AutoArchiveCandidate[] };
  lastRun: PeopleAutoArchiveRun | null;
}

interface LogPerson {
  id: string;
  name: string | null;
  email: string | null;
  lifecycle_status: string;
  archived_reason: string | null;
}

interface AutoArchiveBarProps {
  /** Refresh the list and counts after a run, toggle or restore. */
  onChanged: () => void;
  /** Restore one person (the page's audited restore). */
  onRestore: (userId: string) => Promise<void>;
}

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : 'Never';

export default function AutoArchiveBar({ onChanged, onRestore }: AutoArchiveBarProps) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [alsoEnable, setAlsoEnable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; severity: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/lifecycle/auto-archive');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load auto-archive.');
      setStatus(data);
      setLoadError('');
    } catch (err: any) {
      setLoadError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/lifecycle/auto-archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  };

  const runNow = async () => {
    setBusy(true);
    try {
      const { run } = await post({ action: 'run' });
      if (alsoEnable && !status?.enabled) await post({ action: 'enable', enabled: true });
      setConfirmOpen(false);
      setToast({
        severity: 'success',
        text: `${formatCount(run.archived)} archived${run.restored ? `, ${formatCount(run.restored)} came back` : ''}.${
          alsoEnable && !status?.enabled ? ' Auto-archive is now on every night.' : ''
        }`,
      });
      await load();
      onChanged();
    } catch (err: any) {
      setToast({ severity: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (enabled: boolean) => {
    setBusy(true);
    try {
      await post({ action: 'enable', enabled });
      setToast({ severity: 'success', text: enabled ? 'Auto-archive is on.' : 'Auto-archive is off. Nobody is archived on their own.' });
      await load();
    } catch (err: any) {
      setToast({ severity: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <Alert severity="warning" action={<Button onClick={load} sx={{ minHeight: 44 }}>Try again</Button>}>
        Auto-archive status did not load: {loadError}
      </Alert>
    );
  }
  if (!status) return <Skeleton variant="rounded" height={52} />;

  const { enabled, preview, lastRun, rules } = status;
  const ruleLine = `Leads from earlier seasons after ${rules.earlier_season_idle_days} quiet days, anyone else after ${rules.lead_archive_days}.`;

  return (
    <>
      <Box
        role="status"
        sx={(t: Theme) => ({
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1,
          px: 1.5,
          py: 0.5,
          minHeight: 52,
          borderRadius: 1,
          border: '1px solid',
          borderColor: enabled ? alpha(t.palette.success.main, 0.4) : 'grey.300',
          bgcolor: enabled ? alpha(t.palette.success.main, 0.06) : 'grey.50',
        })}
      >
        <Inventory2OutlinedIcon aria-hidden sx={{ fontSize: 20, color: enabled ? 'success.dark' : 'text.secondary' }} />
        <Typography variant="body2" sx={{ flex: '1 1 320px', minWidth: 0 }}>
          {enabled ? (
            <>
              <b>Auto-archive is on</b>, every night at 3:45 am.{' '}
              {lastRun
                ? `Last run ${dateTime(lastRun.ran_at)}: ${formatCount(lastRun.archived)} archived, ${formatCount(lastRun.restored)} came back.`
                : 'It has not run yet.'}
              {preview.total > 0 && ` ${formatCount(preview.total)} waiting for tonight.`}
            </>
          ) : (
            <>
              <b>Auto-archive is off.</b>{' '}
              {preview.total > 0
                ? `${formatCount(preview.total)} quiet leads can be archived now: ${formatCount(
                    preview.byRule.earlier_season
                  )} from earlier seasons, ${formatCount(preview.byRule.long_quiet)} quiet for ${rules.lead_archive_days} days.`
                : 'Nobody is waiting to be archived.'}
            </>
          )}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {preview.total > 0 && (
            <Button onClick={() => setPreviewOpen(true)} sx={{ minHeight: 44, textTransform: 'none' }}>
              Preview
            </Button>
          )}
          {lastRun && (
            <Button onClick={() => setLogOpen(true)} sx={{ minHeight: 44, textTransform: 'none' }}>
              View log
            </Button>
          )}
          {!enabled && preview.total > 0 && (
            <Button
              variant="contained"
              onClick={() => setConfirmOpen(true)}
              disabled={busy}
              sx={{ minHeight: 44, textTransform: 'none' }}
            >
              Archive {formatCount(preview.total)} now
            </Button>
          )}
          <Button
            onClick={() => (enabled ? toggle(false) : preview.total > 0 ? setConfirmOpen(true) : toggle(true))}
            disabled={busy}
            color={enabled ? 'inherit' : 'primary'}
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            {enabled ? 'Turn off' : 'Turn on'}
          </Button>
        </Box>
      </Box>

      {/* Preview: who the next run would archive */}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ pr: 7 }}>
          {formatCount(preview.total)} people the next run would archive
          <IconButton aria-label="Close" onClick={() => setPreviewOpen(false)} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {ruleLine} Never anyone enrolled, studying, paused, who paid, or a parent account. Showing the{' '}
            {preview.sample.length} most recently active first, so you can check the closest calls.
          </Typography>
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <Box component="thead">
              <Box component="tr" sx={{ textAlign: 'left', color: 'text.secondary', '& th': { py: 0.75, px: 1, fontWeight: 600 } }}>
                <th>Person</th>
                <th>Exam year</th>
                <th>Last active</th>
                <th>Why</th>
              </Box>
            </Box>
            <Box component="tbody">
              {preview.sample.map((c) => (
                <Box component="tr" key={c.user_id} sx={{ borderTop: '1px solid', borderColor: 'grey.100', '& td': { py: 0.75, px: 1 } }}>
                  <td>
                    <Box sx={{ fontWeight: 600 }}>{c.name || 'Unnamed'}</Box>
                    <Box sx={{ color: 'text.secondary' }}>{c.email || ''}</Box>
                  </td>
                  <td>
                    {c.exam_year}
                    {c.exam_year_source === 'signup' ? ' est.' : ''}
                  </td>
                  <td>{shortDate(c.last_activity_at)}</td>
                  <td>{c.rule === 'earlier_season' ? 'Season over' : `Quiet ${rules.lead_archive_days} days`}</td>
                </Box>
              ))}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)} sx={{ minHeight: 44 }}>
            Close
          </Button>
          {!enabled && (
            <Button
              variant="contained"
              onClick={() => {
                setPreviewOpen(false);
                setConfirmOpen(true);
              }}
              sx={{ minHeight: 44 }}
            >
              Archive {formatCount(preview.total)} now
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Confirm a run */}
      <Dialog open={confirmOpen} onClose={() => !busy && setConfirmOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Archive {formatCount(preview.total)} quiet leads?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            They leave the Current list. Nothing else changes for them: they can still sign in to the Tools app and Nexus.
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Anyone who becomes active again comes back to Current on their own. You can also restore anyone from the
            Archived tab or the log.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {ruleLine}
          </Typography>
          {!enabled && (
            <FormControlLabel
              control={<Checkbox checked={alsoEnable} onChange={(e) => setAlsoEnable(e.target.checked)} />}
              label="Also run it every night from now on"
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={busy} sx={{ minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={runNow}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ minHeight: 44 }}
          >
            {busy ? 'Archiving' : `Archive ${formatCount(preview.total)}`}
          </Button>
        </DialogActions>
      </Dialog>

      <RunLogDrawer
        open={logOpen}
        onClose={() => setLogOpen(false)}
        onRestore={async (id) => {
          await onRestore(id);
          setToast({ severity: 'success', text: 'Restored to Current.' });
        }}
      />

      <Snackbar
        open={!!toast}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} variant="filled">
            {toast.text}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
}

function RunLogDrawer({
  open,
  onClose,
  onRestore,
}: {
  open: boolean;
  onClose: () => void;
  onRestore: (userId: string) => Promise<void>;
}) {
  const [data, setData] = useState<{ run: PeopleAutoArchiveRun | null; archived: LogPerson[]; restored: LogPerson[] } | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restoredIds, setRestoredIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setData(null);
    fetch('/api/lifecycle/auto-archive?log=latest')
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ run: null, archived: [], restored: [] }));
  }, [open]);

  const restore = async (id: string) => {
    setRestoring(id);
    try {
      await onRestore(id);
      setRestoredIds((prev) => new Set(prev).add(id));
    } finally {
      setRestoring(null);
    }
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 480 } } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'grey.200' }}>
        <Typography variant="h6" sx={{ flex: 1, fontSize: 18 }}>
          Auto-archive log
        </Typography>
        <IconButton aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>
      <Box sx={{ p: 2, overflowY: 'auto' }}>
        {!data ? (
          <Box sx={{ display: 'grid', gap: 1 }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" height={48} />
            ))}
          </Box>
        ) : !data.run ? (
          <Typography color="text.secondary">No runs yet.</Typography>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {dateTime(data.run.ran_at)}, {data.run.triggered_by === 'cron' ? 'nightly run' : 'run by staff'}.
            </Typography>
            <LogSection title={`Came back (${formatCount(data.run.restored)})`} people={data.restored} empty="Nobody came back." />
            <LogSection
              title={`Archived (${formatCount(data.run.archived)})`}
              people={data.archived}
              empty="Nobody was archived."
              action={(p) =>
                p.lifecycle_status === 'archived' && !restoredIds.has(p.id) ? (
                  <Button
                    size="small"
                    onClick={() => restore(p.id)}
                    disabled={restoring === p.id}
                    sx={{ minHeight: 44, textTransform: 'none' }}
                  >
                    {restoring === p.id ? 'Restoring' : 'Restore'}
                  </Button>
                ) : (
                  <Typography variant="caption" color="success.dark" sx={{ fontWeight: 600 }}>
                    In Current
                  </Typography>
                )
              }
            />
          </>
        )}
      </Box>
    </Drawer>
  );
}

function LogSection({
  title,
  people,
  empty,
  action,
}: {
  title: string;
  people: LogPerson[];
  empty: string;
  action?: (p: LogPerson) => React.ReactNode;
}) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {title}
      </Typography>
      {people.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {empty}
        </Typography>
      ) : (
        people.map((p) => (
          <Box
            key={p.id}
            sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, borderBottom: '1px solid', borderColor: 'grey.100' }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                component="a"
                href={`/crm/${p.id}`}
                variant="body2"
                noWrap
                sx={{ display: 'block', fontWeight: 600, color: 'text.primary', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
              >
                {p.name || 'Unnamed'}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {p.email || ''}
              </Typography>
            </Box>
            {action?.(p)}
          </Box>
        ))
      )}
    </Box>
  );
}
