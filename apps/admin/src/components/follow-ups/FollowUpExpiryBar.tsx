'use client';

/**
 * Old follow-ups close by themselves (migration 20261209090300).
 *
 * Each night a job closes open follow-ups that no longer need a call: the person
 * already joined, their exam season passed, they were archived, a counselling
 * request is 60+ days old, or a request with no account is 30+ days old. Rows
 * become "Closed by system", never deleted, and can be reopened from that tab.
 * This bar shows what would close now and lets staff preview, run and turn the
 * nightly job on or off.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Skeleton,
  Snackbar,
  Typography,
  alpha,
} from '@neram/ui';
import type { Theme } from '@mui/material/styles';
import AutoDeleteOutlinedIcon from '@mui/icons-material/AutoDeleteOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { FOLLOW_UP_CLOSE_REASON_LABELS, type FollowUpCloseReason, type FollowUpExpiryCandidate } from '@neram/database';
import { followUpKindLabel } from '@/lib/follow-up-source';
import { formatIstDate } from '@/lib/ops-format';

interface Status {
  enabled: boolean;
  total: number;
  linked: number;
  byReason: Partial<Record<FollowUpCloseReason, number>>;
  rows: FollowUpExpiryCandidate[];
}

const REASON_ORDER: FollowUpCloseReason[] = ['earlier_season', 'counselling_over', 'already_student', 'archived', 'no_account_stale'];

/** "19 exam season has passed, 21 counselling season is over, ..." */
function reasonSummary(byReason: Status['byReason']): string {
  return REASON_ORDER.filter((r) => byReason[r])
    .map((r) => `${byReason[r]} ${FOLLOW_UP_CLOSE_REASON_LABELS[r].toLowerCase()}`)
    .join(', ');
}

export default function FollowUpExpiryBar({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [alsoNightly, setAlsoNightly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; severity: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/crm/follow-ups/expiry', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load old follow-ups.');
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
    const res = await fetch('/api/crm/follow-ups/expiry', {
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
      const turningOn = alsoNightly && !status?.enabled;
      const { run } = await post({ action: 'run', nightly: turningOn });
      setConfirmOpen(false);
      setToast({
        severity: 'success',
        text: `${run.closed} closed${run.linked ? `, ${run.linked} attached to their person` : ''}.${
          turningOn ? ' Old follow-ups now close every night.' : ''
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
      setToast({ severity: 'success', text: enabled ? 'Old follow-ups now close every night.' : 'Nightly close is off.' });
      await load();
    } catch (err: any) {
      setToast({ severity: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }} action={<Button onClick={load} sx={{ minHeight: 44 }}>Try again</Button>}>
        Old follow-ups did not load: {loadError}
      </Alert>
    );
  }
  if (!status) return <Skeleton variant="rounded" height={52} sx={{ mb: 2 }} />;

  const { enabled, total } = status;
  // Nothing to say: the job is on and there is nothing waiting.
  if (enabled && total === 0) return null;

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
          mb: 2,
          minHeight: 52,
          borderRadius: 1,
          border: '1px solid',
          borderColor: enabled ? alpha(t.palette.success.main, 0.4) : 'grey.300',
          bgcolor: enabled ? alpha(t.palette.success.main, 0.06) : 'grey.50',
        })}
      >
        <AutoDeleteOutlinedIcon aria-hidden sx={{ fontSize: 20, color: enabled ? 'success.dark' : 'text.secondary' }} />
        <Typography variant="body2" sx={{ flex: '1 1 320px', minWidth: 0 }}>
          {total === 0 ? (
            <>
              <b>No old follow-ups.</b> Turn on the nightly close so the list stays this way.
            </>
          ) : enabled ? (
            <>
              <b>{total} old follow-ups</b> close tonight at 3:50 am: {reasonSummary(status.byReason)}.
            </>
          ) : (
            <>
              <b>{total} follow-ups no longer need a call:</b> {reasonSummary(status.byReason)}.
            </>
          )}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {total > 0 && (
            <Button onClick={() => setPreviewOpen(true)} sx={{ minHeight: 44, textTransform: 'none' }}>
              Preview
            </Button>
          )}
          {total > 0 && (
            <Button variant="contained" onClick={() => setConfirmOpen(true)} disabled={busy} sx={{ minHeight: 44, textTransform: 'none' }}>
              Close {total} now
            </Button>
          )}
          <Button
            onClick={() => toggle(!enabled)}
            disabled={busy}
            color={enabled ? 'inherit' : 'primary'}
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            {enabled ? 'Turn off nightly' : 'Turn on nightly'}
          </Button>
        </Box>
      </Box>

      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ pr: 7 }}>
          {total} follow-ups that would close
          <IconButton aria-label="Close" onClick={() => setPreviewOpen(false)} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Nothing is deleted. Each one moves to Closed by system with its reason, stays on the person's page, and can be reopened.
            {status.linked > 0 && ` ${status.linked} without an account match a person by phone and get attached to them.`}
          </Typography>
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <Box component="thead">
              <Box component="tr" sx={{ textAlign: 'left', color: 'text.secondary', '& th': { py: 0.75, px: 1, fontWeight: 600 } }}>
                <th>Person</th>
                <th>Request</th>
                <th>Asked on</th>
                <th>Why it closes</th>
              </Box>
            </Box>
            <Box component="tbody">
              {status.rows.map((r) => (
                <Box component="tr" key={r.callback_id} sx={{ borderTop: '1px solid', borderColor: 'grey.100', '& td': { py: 0.75, px: 1, verticalAlign: 'top' } }}>
                  <td>
                    <Box sx={{ fontWeight: 600 }}>{r.name || 'Unnamed'}</Box>
                    <Box sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{r.phone || ''}</Box>
                  </td>
                  <td>{followUpKindLabel(r.query_type)}</td>
                  <td>{formatIstDate(r.created_at)}</td>
                  <td>
                    {FOLLOW_UP_CLOSE_REASON_LABELS[r.reason]}
                    {r.reason === 'earlier_season' && r.exam_year ? ` (${r.exam_year})` : ''}
                    {r.matched_user_id && (
                      <Box component="span" sx={{ display: 'block', color: 'text.secondary' }}>
                        Attached by phone
                      </Box>
                    )}
                  </td>
                </Box>
              ))}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)} sx={{ minHeight: 44 }}>
            Back
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setPreviewOpen(false);
              setConfirmOpen(true);
            }}
            sx={{ minHeight: 44 }}
          >
            Close {total} now
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmOpen} onClose={() => !busy && setConfirmOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Close {total} old follow-ups?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            They leave the Follow-ups list and the badge. Nothing is deleted: each one moves to Closed by system with its reason
            and can be reopened.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {reasonSummary(status.byReason)}.
          </Typography>
          {!enabled && (
            <FormControlLabel
              control={<Checkbox checked={alsoNightly} onChange={(e) => setAlsoNightly(e.target.checked)} />}
              label="Also close old follow-ups every night from now on"
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
            {busy ? 'Closing' : `Close ${total}`}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} variant="filled">
            {toast.text}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
}
