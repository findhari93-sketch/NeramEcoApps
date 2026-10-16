'use client';

import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@neram/ui';
import { FOLLOW_UP_OUTCOME_LABELS, INTEREST_LABELS, type FollowUpOutcome, type InterestLevel } from '@neram/database/demo-follow-up';
import { istDateKey, istDateTime } from '@neram/database/demo-schedule';

const CHIP_SX = {
  gap: 1,
  flexWrap: 'wrap',
  '& .MuiToggleButton-root': {
    minHeight: 44,
    px: 2,
    border: 1,
    borderColor: 'divider',
    borderRadius: '8px !important',
    textTransform: 'none',
    '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
  },
} as const;

/** Quick reasons for stopping a follow-up; a tap fills the reason box. */
const STOP_REASONS = ['Joined another institute', 'Fees', 'Next year', 'Not reachable', 'Other'];

export default function LogOutcomeDialog({
  open,
  name,
  callbackId,
  interest: currentInterest,
  stopMode = false,
  onClose,
  onSaved,
}: {
  open: boolean;
  name: string;
  callbackId: string;
  interest: InterestLevel | null;
  /** "Stop follow-up": only the not-interested outcome, with quick reasons. */
  stopMode?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [outcome, setOutcome] = useState<FollowUpOutcome | null>(null);
  const [interest, setInterest] = useState<InterestLevel | null>(currentInterest);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('11:00');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setOutcome(stopMode ? 'not_interested' : null);
    setInterest(currentInterest);
    setDate(istDateKey(new Date(Date.now() + 2 * 86_400_000)));
    setTime('11:00');
    setNote('');
    setReason('');
    setError(null);
  }, [open, currentInterest, stopMode]);

  const needsDate = outcome === 'thinking' || outcome === 'will_join';
  const next = needsDate && date && /^\d{2}:\d{2}$/.test(time) ? istDateTime(date, time) : null;
  const ok =
    !!outcome &&
    (!needsDate || (!!next && next.getTime() > Date.now())) &&
    (outcome !== 'not_interested' || reason.trim().length > 1);

  const save = async () => {
    if (!outcome) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/follow-ups/${callbackId}/outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome, nextAt: next?.toISOString(), note: note.trim(), reason: reason.trim(), interest }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not save.');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="outcome-title">
      <DialogTitle id="outcome-title">{stopMode ? `Stop following up ${name}?` : `Call with ${name}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'grid', gap: 2 }}>
        {stopMode && (
          <Typography variant="body2" color="text.secondary">
            They move to Closed with this reason. You can restart the follow-up later.
          </Typography>
        )}
        <Box sx={{ display: stopMode ? 'none' : 'block' }}>
          <Typography variant="body2" id="outcome-label" sx={{ mb: 1 }}>How did it go?</Typography>
          <ToggleButtonGroup exclusive value={outcome} onChange={(_, v) => setOutcome(v)} aria-labelledby="outcome-label" sx={CHIP_SX}>
            {(Object.keys(FOLLOW_UP_OUTCOME_LABELS) as FollowUpOutcome[]).map((o) => (
              <ToggleButton key={o} value={o}>{FOLLOW_UP_OUTCOME_LABELS[o]}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
        {needsDate && (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField
              label={outcome === 'will_join' ? 'They will join on' : 'Next follow-up'}
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              InputLabelProps={{ shrink: true }} inputProps={{ min: istDateKey(new Date()) }} required
            />
            <TextField label="Time (India)" type="time" value={time} onChange={(e) => setTime(e.target.value)} InputLabelProps={{ shrink: true }} required />
          </Box>
        )}
        {outcome === 'no_answer' && (
          <Typography variant="body2" color="text.secondary">We will remind you to try again in 2 days.</Typography>
        )}
        {outcome === 'not_interested' && (
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            <Box>
              <Typography variant="body2" id="stop-reason-label" sx={{ mb: 1 }}>Reason</Typography>
              <ToggleButtonGroup
                exclusive
                value={STOP_REASONS.includes(reason) ? reason : null}
                onChange={(_, v) => v && setReason(v === 'Other' ? '' : v)}
                aria-labelledby="stop-reason-label"
                sx={CHIP_SX}
              >
                {STOP_REASONS.map((r) => (
                  <ToggleButton key={r} value={r}>{r}</ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
            <TextField label="Why not? (required)" value={reason} onChange={(e) => setReason(e.target.value)} inputProps={{ maxLength: 300 }} required />
          </Box>
        )}
        {outcome && outcome !== 'not_interested' && (
          <Box>
            <Typography variant="body2" id="interest2-label" sx={{ mb: 1 }}>Interest now</Typography>
            <ToggleButtonGroup exclusive value={interest} onChange={(_, v) => v && setInterest(v)} aria-labelledby="interest2-label" sx={CHIP_SX}>
              {(Object.keys(INTEREST_LABELS) as InterestLevel[]).map((k) => (
                <ToggleButton key={k} value={k}>{INTEREST_LABELS[k]}</ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
        )}
        <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} inputProps={{ maxLength: 1000 }} />
        {error && <Alert severity="error" role="alert">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={busy} sx={{ minHeight: 44 }}>Back</Button>
        <Button variant="contained" color={stopMode ? 'error' : 'primary'} onClick={save} disabled={!ok || busy} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined} sx={{ minHeight: 44 }}>
          {busy ? 'Saving' : stopMode ? 'Stop follow-up' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
