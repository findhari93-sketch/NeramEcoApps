'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
} from '@neram/ui';

interface BatchFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; description: string }) => Promise<void>;
  initialData?: { name: string; description: string | null };
  mode: 'create' | 'edit';
}

export default function BatchFormDialog({
  open,
  onClose,
  onSubmit,
  initialData,
  mode,
}: BatchFormDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && initialData) {
      setName(initialData.name);
      setDescription(initialData.description || '');
    } else if (open) {
      setName('');
      setDescription('');
    }
    setError('');
  }, [open, initialData]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({ name: name.trim(), description: description.trim() });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save batch';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{ sx: { mx: { xs: 2 }, width: { xs: 'calc(100% - 32px)' } } }}
    >
      <DialogTitle>{mode === 'create' ? 'Create Batch' : 'Edit Batch'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            label="Batch Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            placeholder="e.g., Batch A"
            error={!!error}
            helperText={error}
            inputProps={{ style: { minHeight: 24 } }}
          />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
            placeholder="Optional description..."
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!name.trim() || submitting}
        >
          {submitting ? 'Saving...' : mode === 'create' ? 'Create' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
