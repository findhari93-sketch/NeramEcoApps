'use client';

import { useEffect, useState, type ElementType, type ReactNode } from 'react';
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
import { FOCUS_RING, TARGET_44 } from '@/components/ops/OpsUi';

export interface ConfirmActionConfig {
  title: string;
  icon: ElementType;
  body: ReactNode;
  confirmLabel: string;
  color?: 'primary' | 'error' | 'warning';
  /** Label for an optional note field; omit to hide it. */
  noteLabel?: string;
  notePlaceholder?: string;
  run: (note: string) => Promise<void>;
}

/** One dialog for every suggestion action: explains, takes an optional note, runs, reports errors. */
export default function ConfirmActionDialog({
  config,
  onClose,
}: {
  config: ConfirmActionConfig | null;
  onClose: () => void;
}) {
  const fullScreen = useMediaQuery('(max-width:599px)');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (config) {
      setNote('');
      setError('');
      setBusy(false);
    }
  }, [config]);

  if (!config) return null;
  const Icon = config.icon;

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await config.run(note.trim());
    } catch (e: any) {
      setError(e?.message || 'That did not work. Try again.');
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={() => !busy && onClose()}
      maxWidth="xs"
      fullWidth
      fullScreen={fullScreen}
      aria-labelledby="lifecycle-action-title"
    >
      <DialogTitle id="lifecycle-action-title" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Icon aria-hidden />
        {config.title}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" component="div" color="text.secondary" sx={{ mb: config.noteLabel ? 2 : 0 }}>
          {config.body}
        </Typography>
        {error && (
          <Alert severity="error" sx={{ my: 2 }}>
            {error}
          </Alert>
        )}
        {config.noteLabel && (
          <TextField
            fullWidth
            multiline
            minRows={2}
            label={config.noteLabel}
            placeholder={config.notePlaceholder}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            helperText="Optional. Saved with the suggestion."
            inputProps={{ maxLength: 500 }}
            disabled={busy}
          />
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={busy} sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={config.color || 'primary'}
          onClick={confirm}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}
        >
          {busy ? 'Working' : config.confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
