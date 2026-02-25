'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  TextField,
  Button,
  Alert,
  Box,
  Divider,
  IconButton,
  SwipeableDrawer,
} from '@neram/ui';
import { CloseIcon } from '@neram/ui';
import { useIsMobile } from '@neram/ui/hooks';
import { REFUND_PROCESSING_FEE_PERCENT } from '@neram/database';

interface RefundRequestDialogProps {
  open: boolean;
  onClose: () => void;
  paymentId: string;
  paymentAmount: number;
  leadProfileId: string;
  onSuccess: () => void;
}

export default function RefundRequestDialog({
  open,
  onClose,
  paymentId,
  paymentAmount,
  leadProfileId,
  onSuccess,
}: RefundRequestDialogProps) {
  const isMobile = useIsMobile();
  const [reasonForJoining, setReasonForJoining] = useState('');
  const [reasonForDiscontinuing, setReasonForDiscontinuing] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processingFee = Math.round((paymentAmount * REFUND_PROCESSING_FEE_PERCENT) / 100);
  const refundAmount = paymentAmount - processingFee;

  const canSubmit = reasonForJoining.trim().length >= 10 && reasonForDiscontinuing.trim().length >= 10;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/refund/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_id: paymentId,
          reason_for_joining: reasonForJoining.trim(),
          reason_for_discontinuing: reasonForDiscontinuing.trim(),
          additional_notes: additionalNotes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit refund request');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const content = (
    <Box>
      {/* Refund calculation summary */}
      <Box
        sx={{
          bgcolor: '#FFF3E0',
          borderRadius: 2,
          p: 2,
          mb: 2.5,
          border: '1px solid',
          borderColor: '#FFE0B2',
        }}
      >
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1, color: '#E65100' }}>
          Refund Calculation
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2">Payment Amount</Typography>
          <Typography variant="body2" fontWeight={600}>Rs. {paymentAmount.toLocaleString('en-IN')}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2" color="error.main">Processing Fee (30%)</Typography>
          <Typography variant="body2" color="error.main">- Rs. {processingFee.toLocaleString('en-IN')}</Typography>
        </Box>
        <Divider sx={{ my: 1 }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="body2" fontWeight={700}>Eligible Refund</Typography>
          <Typography variant="body2" fontWeight={700} color="success.dark">Rs. {refundAmount.toLocaleString('en-IN')}</Typography>
        </Box>
      </Box>

      {/* Policy notice */}
      <Alert severity="warning" sx={{ mb: 2.5, fontSize: 12 }}>
        Refund approval is at the sole discretion of Neram Classes. A 30% processing fee applies. This decision is final.
      </Alert>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Form fields */}
      <TextField
        label="Why did you join Neram Classes?"
        placeholder="Please explain your original reason for enrolling..."
        multiline
        rows={3}
        fullWidth
        required
        value={reasonForJoining}
        onChange={(e) => setReasonForJoining(e.target.value)}
        sx={{ mb: 2 }}
        helperText={reasonForJoining.length < 10 ? 'Please provide at least 10 characters' : ''}
        error={reasonForJoining.length > 0 && reasonForJoining.length < 10}
      />

      <TextField
        label="Why do you want to discontinue?"
        placeholder="Please explain why you wish to request a refund..."
        multiline
        rows={3}
        fullWidth
        required
        value={reasonForDiscontinuing}
        onChange={(e) => setReasonForDiscontinuing(e.target.value)}
        sx={{ mb: 2 }}
        helperText={reasonForDiscontinuing.length < 10 ? 'Please provide at least 10 characters' : ''}
        error={reasonForDiscontinuing.length > 0 && reasonForDiscontinuing.length < 10}
      />

      <TextField
        label="Additional Notes (Optional)"
        placeholder="Any other information to support your request..."
        multiline
        rows={2}
        fullWidth
        value={additionalNotes}
        onChange={(e) => setAdditionalNotes(e.target.value)}
        sx={{ mb: 1 }}
      />
    </Box>
  );

  if (isMobile) {
    return (
      <SwipeableDrawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        onOpen={() => {}}
        disableSwipeToOpen
        PaperProps={{
          sx: { borderRadius: '16px 16px 0 0', maxHeight: '90vh' },
        }}
      >
        <Box sx={{ p: 2 }}>
          {/* Drag handle */}
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
            <Box sx={{ width: 40, height: 4, bgcolor: 'grey.400', borderRadius: 2 }} />
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="h6" fontWeight={700}>
              Request Refund
            </Typography>
            <IconButton size="small" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
          <Divider sx={{ mb: 2 }} />

          <Box sx={{ overflow: 'auto', maxHeight: '65vh', pb: 2 }}>
            {content}
          </Box>

          <Box sx={{ display: 'flex', gap: 1, pt: 1 }}>
            <Button variant="outlined" onClick={onClose} fullWidth disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleSubmit}
              fullWidth
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </Button>
          </Box>
        </Box>
      </SwipeableDrawer>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" fontWeight={700}>Request Refund</Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 2.5 }}>
        {content}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="outlined" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleSubmit}
          disabled={!canSubmit || isSubmitting}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Refund Request'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
