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
  Typography,
} from '@neram/ui';
import HeldDemoFields, { checkHeld, defaultHeldValue, heldPayload, type HeldValue } from './HeldDemoFields';

/**
 * "Demo already held" on an open request: the demo happened outside the desk
 * (Google Meet, a call, in person). Marks it done and starts the follow-up.
 */
export default function HeldDemoDialog({
  open,
  name,
  confirmed,
  tutors,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  name: string;
  /** The request already had a confirmed time. */
  confirmed: boolean;
  tutors: Array<{ upn: string; name: string }>;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [value, setValue] = useState<HeldValue>(defaultHeldValue);

  useEffect(() => {
    if (open) setValue(defaultHeldValue());
  }, [open]);

  const { ok } = checkHeld(value);

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="held-demo-title">
      <DialogTitle id="held-demo-title">Demo already held with {name}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {confirmed
            ? 'Use this when the demo happened at another time or on another link. It moves to Done and the follow-up starts.'
            : 'Use this when you took the demo outside the desk, for example on Google Meet or a call. It moves to Done and the follow-up starts.'}
        </Typography>
        <HeldDemoFields value={value} onChange={setValue} tutors={tutors} />
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
          onClick={() => onSubmit({ action: 'held', ...heldPayload(value) })}
          disabled={busy || !ok}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ minHeight: 44 }}
        >
          {busy ? 'Saving' : value.outcome === 'attended' ? 'Save and start follow-up' : 'Save as no-show'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
