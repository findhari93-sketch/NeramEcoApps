'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@neram/ui';
import { istDateTime } from '@neram/database/demo-schedule';
import AttendedFields, { defaultAttendedValue, type AttendedValue } from './AttendedFields';

export default function AttendedDialog({
  open,
  name,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  name: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (v: { interest: string; note: string; nextFollowUpAt: string }) => void;
}) {
  const [value, setValue] = useState<AttendedValue>(defaultAttendedValue());
  useEffect(() => {
    if (open) setValue(defaultAttendedValue());
  }, [open]);
  const next = value.nextDate && /^\d{2}:\d{2}$/.test(value.nextTime) ? istDateTime(value.nextDate, value.nextTime) : null;
  const ok = !!value.interest && !!next && next.getTime() > Date.now();
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="attended-title">
      <DialogTitle id="attended-title">{name} attended</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          This starts their follow-up. The owner is reminded on the date you pick.
        </Typography>
        <AttendedFields value={value} onChange={setValue} />
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
          color="success"
          disabled={!ok || busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          onClick={() => next && onSubmit({ interest: value.interest!, note: value.note.trim(), nextFollowUpAt: next.toISOString() })}
          sx={{ minHeight: 44 }}
        >
          {busy ? 'Saving' : 'Save and start follow-up'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
