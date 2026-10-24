'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@neram/ui';
import { istDateKey } from '@neram/database/demo-schedule';
import { LATER_PRESETS, formatLaterDate, laterContactAt, laterDateError, laterDateFor, type LaterPreset } from '@/lib/demo/try-later';

/**
 * "Try later": the family asked us to wait. Pick when to try again and note
 * why; the request leaves the working tabs until then.
 */
export default function TryLaterDialog({
  open,
  name,
  confirmed,
  afterDemo = false,
  hasEmail,
  now,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  name: string;
  /** The demo had a confirmed time (its meeting is cancelled). */
  confirmed: boolean;
  /** The demo is over: the follow-up is parked, no family email goes out. */
  afterDemo?: boolean;
  /** We have an email for the family, so they get one on the date. */
  hasEmail: boolean;
  now: Date;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (body: { action: 'try_later'; laterDate: string; reason: string }) => void;
}) {
  const [preset, setPreset] = useState<LaterPreset>('1m');
  const [custom, setCustom] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      setPreset('1m');
      setCustom('');
      setReason('');
    }
  }, [open]);

  const dateKey = preset === 'custom' ? custom : laterDateFor(preset, now) ?? '';
  const dateError = dateKey ? laterDateError(dateKey, now) : null;
  const ok = !!dateKey && !dateError && reason.trim().length >= 3;
  const tomorrow = istDateKey(new Date(now.getTime() + 24 * 60 * 60_000));
  const yearOut = istDateKey(new Date(now.getTime() + 365 * 24 * 60 * 60_000));
  const first = name.trim().split(/\s+/)[0] || name;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="try-later-title">
      <DialogTitle id="try-later-title">Try again later with {first}?</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {afterDemo ? (
            'The follow-up pauses and they move to the Later tab. On the date you pick you get the follow-up reminder, and they come back to After demo.'
          ) : (
            <>
              {confirmed ? 'The Teams meeting is cancelled and their reminders stop. ' : ''}
              It moves to the Later tab. On the date you pick you get a Neram Assistant reminder to call, and it comes back to To call.
              {hasEmail ? ' The family also gets one email asking if it is a better time.' : ' There is no email on file, so send them the message on WhatsApp from here on that day.'}
            </>
          )}
        </Typography>

        <Typography id="try-later-when" variant="subtitle2" component="p" sx={{ mb: 1 }}>
          When should we try again?
        </Typography>
        <ToggleButtonGroup
          exclusive
          value={preset}
          onChange={(_, v: LaterPreset | null) => v && setPreset(v)}
          aria-labelledby="try-later-when"
          sx={{ flexWrap: 'wrap', gap: 1, '& .MuiToggleButton-root': { minHeight: 44, border: 1, borderColor: 'divider', borderRadius: '8px !important', textTransform: 'none' } }}
        >
          {LATER_PRESETS.map((p) => (
            <ToggleButton key={p.id} value={p.id}>
              {p.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {preset === 'custom' && (
          <TextField
            label="Try again on"
            type="date"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: tomorrow, max: yearOut }}
            error={!!custom && !!dateError}
            helperText={custom && dateError ? dateError : ' '}
            sx={{ mt: 2, display: 'flex', maxWidth: 240 }}
          />
        )}
        {dateKey && !dateError && (
          <Typography variant="body2" sx={{ mt: preset === 'custom' ? 0 : 1.5 }}>
            Reminder on <b>{formatLaterDate(laterContactAt(dateKey))}</b>, 10 AM.
          </Typography>
        )}

        <TextField
          label="Why are they waiting?"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={afterDemo ? 'Mother asked us to call after the school exams' : 'Parent will call when the daughter is free'}
          required
          fullWidth
          multiline
          minRows={2}
          inputProps={{ maxLength: 300 }}
          sx={{ mt: 2.5 }}
        />

        {error && (
          <Alert severity="error" sx={{ mt: 2 }} role="alert">
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={busy} sx={{ minHeight: 44 }}>
          Back
        </Button>
        <Button
          variant="contained"
          onClick={() => onSubmit({ action: 'try_later', laterDate: dateKey, reason: reason.trim() })}
          disabled={busy || !ok}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ minHeight: 44 }}
        >
          {busy ? 'Saving' : 'Try later'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
