'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
} from '@neram/ui';

interface ClassroomFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; type: string; description: string }) => Promise<void>;
  initialData?: { name: string; type: string; description: string | null };
  mode: 'create' | 'edit';
}

export default function ClassroomFormDialog({
  open,
  onClose,
  onSubmit,
  initialData,
  mode,
}: ClassroomFormDialogProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState('nata');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && initialData) {
      setName(initialData.name);
      setType(initialData.type);
      setDescription(initialData.description || '');
    } else if (open) {
      setName('');
      setType('nata');
      setDescription('');
    }
  }, [open, initialData]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), type, description: description.trim() });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{ sx: { mx: { xs: 2 }, width: { xs: 'calc(100% - 32px)' } } }}
    >
      <DialogTitle>{mode === 'create' ? 'Create Classroom' : 'Edit Classroom'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            label="Classroom Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            placeholder="e.g., NATA 2026"
            inputProps={{ style: { minHeight: 24 } }}
          />
          <FormControl fullWidth>
            <InputLabel shrink>Type</InputLabel>
            <Select
              value={type}
              label="Type"
              onChange={(e) => setType(e.target.value)}
            >
              <MenuItem value="nata">NATA</MenuItem>
              <MenuItem value="jee">JEE</MenuItem>
              <MenuItem value="revit">Revit</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={3}
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
