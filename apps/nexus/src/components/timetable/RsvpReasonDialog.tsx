'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
} from '@neram/ui';

interface RsvpReasonDialogProps {
  open: boolean;
  onClose: () => void;
  classTitle: string;
  onSubmit: (reason: string) => void;
  submitting?: boolean;
}

export default function RsvpReasonDialog({
  open,
  onClose,
  classTitle,
  onSubmit,
  submitting,
}: RsvpReasonDialogProps) {
  const [reason, setReason] = useState('');

  const handleSubmit = () => {
    if (reason.trim()) {
      onSubmit(reason.trim());
      setReason('');
    }
  };

  const handleClose = () => {
    setReason('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle>Can&apos;t Attend</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Please provide a reason for not attending <strong>{classTitle}</strong>.
        </Typography>
        <Box sx={{ pt: 0.5 }}>
          <TextField
            label="Reason *"
            fullWidth
            multiline
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Have an exam, feeling unwell, family event..."
            autoFocus
            inputProps={{ style: { minHeight: 48 } }}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} sx={{ minHeight: 48 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleSubmit}
          disabled={!reason.trim() || submitting}
          sx={{ minHeight: 48 }}
        >
          {submitting ? 'Submitting...' : 'Submit'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
