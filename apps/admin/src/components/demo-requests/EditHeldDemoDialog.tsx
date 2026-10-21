'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from '@neram/ui';
import { istDateKey, istDateTime } from '@neram/database/demo-schedule';
import { STAFF_DEMO_PLATFORMS } from '@/lib/demo/staff-add';
import type { DemoRequest } from './types';

function istTime(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

/**
 * Fix a demo that was recorded as held outside the desk: the time it happened,
 * who took it, and where. Whether they attended stays on the Attended / No-show
 * buttons; this only corrects the recorded details.
 */
export default function EditHeldDemoDialog({
  open,
  request,
  tutors,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  request: DemoRequest;
  tutors: Array<{ upn: string; name: string }>;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const held = request.scheduled_start ? new Date(request.scheduled_start) : null;
  const [date, setDate] = useState(held ? istDateKey(held) : istDateKey(new Date()));
  const [time, setTime] = useState(held ? istTime(held) : '18:00');
  const [tutorUpn, setTutorUpn] = useState(request.tutor_upn ?? (tutors[0]?.upn ?? ''));
  const [platform, setPlatform] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      const h = request.scheduled_start ? new Date(request.scheduled_start) : null;
      setDate(h ? istDateKey(h) : istDateKey(new Date()));
      setTime(h ? istTime(h) : '18:00');
      setTutorUpn(request.tutor_upn ?? (tutors[0]?.upn ?? ''));
      setPlatform('');
      setNote('');
    }
  }, [open, request.scheduled_start, request.tutor_upn, tutors]);

  const at = date && /^\d{2}:\d{2}$/.test(time) ? istDateTime(date, time) : null;
  const inFuture = at ? at.getTime() > Date.now() + 5 * 60_000 : false;
  const canSave = !!at && !inFuture && !!tutorUpn;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="edit-held-title">
      <DialogTitle id="edit-held-title">Fix the held demo</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Correct the time this demo happened, who took it and where. To change whether they attended, use the Attended or No-show buttons.
        </Typography>
        <Box sx={{ display: 'grid', gap: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              inputProps={{ max: istDateKey(new Date()) }}
              required
            />
            <TextField
              label="Time (India)"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              InputLabelProps={{ shrink: true }}
              error={inFuture}
              helperText={inFuture ? 'This is in the future.' : ' '}
              required
            />
            <TextField select label="Who took it" value={tutorUpn} onChange={(e) => setTutorUpn(e.target.value)} required>
              {tutors.map((t) => (
                <MenuItem key={t.upn} value={t.upn}>
                  {t.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Held on (optional)"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              helperText="Leave blank to keep what was recorded"
            >
              <MenuItem value="">Unchanged</MenuItem>
              {STAFF_DEMO_PLATFORMS.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.label}
                </MenuItem>
              ))}
            </TextField>
          </Box>
          <TextField
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Corrected the time, it was actually at 5 PM"
            multiline
            minRows={2}
            inputProps={{ maxLength: 500 }}
          />
        </Box>
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
          disabled={busy || !canSave}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ minHeight: 44 }}
          onClick={() =>
            at &&
            onSubmit({
              action: 'edit_held',
              heldAt: at.toISOString(),
              tutorUpn,
              platform: platform || undefined,
              note: note.trim() || undefined,
            })
          }
        >
          {busy ? 'Saving' : 'Save changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
