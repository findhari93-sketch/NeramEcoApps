'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
} from '@neram/ui';

interface VerifyRejectDialogProps {
  open: boolean;
  action: 'verify' | 'reject' | null;
  documentTitle: string;
  onClose: () => void;
  onConfirm: (action: 'verify' | 'reject', rejectionReason?: string) => void;
  loading?: boolean;
}

export default function VerifyRejectDialog({
  open,
  action,
  documentTitle,
  onClose,
  onConfirm,
  loading,
}: VerifyRejectDialogProps) {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    if (!action) return;
    onConfirm(action, action === 'reject' ? reason : undefined);
    setReason('');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {action === 'verify' ? 'Verify Document' : 'Reject Document'}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {action === 'verify'
            ? `Mark "${documentTitle}" as verified?`
            : `Reject "${documentTitle}"? Please provide a reason.`}
        </Typography>
        {action === 'reject' && (
          <TextField
            label="Rejection Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            size="small"
            fullWidth
            multiline
            rows={2}
            required
          />
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>Cancel</Button>
        <Button
          variant="contained"
          color={action === 'verify' ? 'success' : 'error'}
          onClick={handleConfirm}
          disabled={loading || (action === 'reject' && !reason.trim())}
          sx={{ textTransform: 'none' }}
        >
          {loading ? 'Saving...' : action === 'verify' ? 'Verify' : 'Reject'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
