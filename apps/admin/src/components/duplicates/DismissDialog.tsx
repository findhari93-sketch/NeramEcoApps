'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  useMediaQuery,
} from '@neram/ui';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import { FOCUS_RING, TARGET_44 } from '@/components/ops/OpsUi';

/**
 * "Not the same person". The reason is required (at least 3 characters) so the
 * next person reading the queue knows why the pair was closed.
 */
export default function DismissDialog({
  open,
  candidateId,
  names,
  onClose,
  onDismissed,
}: {
  open: boolean;
  candidateId: string | null;
  names: string;
  onClose: () => void;
  onDismissed: () => void;
}) {
  const fullScreen = useMediaQuery('(max-width:599px)');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setNote('');
      setTouched(false);
      setError('');
    }
  }, [open]);

  const tooShort = note.trim().length < 3;

  const submit = async () => {
    setTouched(true);
    if (tooShort || !candidateId) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/duplicates/${candidateId}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not close this pair.');
      onDismissed();
    } catch (e: any) {
      setError(e?.message || 'Could not close this pair.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      maxWidth="xs"
      fullWidth
      fullScreen={fullScreen}
      aria-labelledby="dismiss-dialog-title"
    >
      <DialogTitle id="dismiss-dialog-title" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <PersonOffOutlinedIcon aria-hidden />
        Not the same person
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {names} stay as two records and this pair is not suggested again. Say why, so others know.
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={2}
          label="Reason"
          placeholder="For example: siblings sharing a parent phone"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => setTouched(true)}
          error={touched && tooShort}
          helperText={touched && tooShort ? 'Write at least 3 characters.' : 'Required. Staff see this on the Dismissed tab.'}
          inputProps={{ maxLength: 500 }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={saving} sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}
        >
          {saving ? 'Saving' : 'Mark as different people'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
