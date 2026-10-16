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
  Box,
  IconButton,
  SwipeableDrawer,
} from '@neram/ui';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import { useIsMobile } from '@neram/ui/hooks';
import { REFUND_PROCESSING_FEE_PERCENT } from '@neram/database';
import { tokens as t } from '@/design-system';
import { railCardSx } from './styles';
import { APPLY_ERROR } from './shell/applyTheme';

const inr = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const focusSx = { '&.Mui-focusVisible, &:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' } } as const;

/** Gold primary with navy text, the one action of the dialog. */
const primarySx = {
  minHeight: 48,
  px: 2.5,
  borderRadius: `${t.radius}px`,
  bgcolor: t.gold500,
  color: t.navy900,
  fontSize: 15,
  fontWeight: 800,
  textTransform: 'none',
  boxShadow: 'none',
  '&:hover': { bgcolor: t.gold300, boxShadow: 'none' },
  '&.Mui-disabled': { bgcolor: t.gold500, color: t.navy900, opacity: 0.5 },
  ...focusSx,
} as const;

const secondarySx = {
  minHeight: 48,
  px: 2.5,
  borderRadius: `${t.radius}px`,
  border: `1px solid ${t.lineStrong}`,
  bgcolor: t.surface,
  color: t.ink,
  fontSize: 15,
  fontWeight: 700,
  textTransform: 'none',
  '&:hover': { bgcolor: t.navy900, color: t.paper, borderColor: t.navy900 },
  ...focusSx,
} as const;

const closeSx = { width: 44, height: 44, color: t.ink, ...focusSx } as const;
const titleSx = { m: 0, fontSize: '1.25rem', fontWeight: 800, color: t.ink } as const;

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

  const rowSx = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 2,
    py: 1.25,
    borderBottom: `1px solid ${t.line}`,
    fontSize: 15,
  } as const;

  const content = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Refund calculation: a ruled summary, the deduction in ink */}
      <Box>
        <Typography component="h3" sx={{ m: 0, mb: 1, fontSize: 15, fontWeight: 700, color: t.ink }}>
          Refund calculation
        </Typography>
        <Box component="dl" sx={{ m: 0, borderTop: `1px solid ${t.ink}` }}>
          <Box sx={rowSx}>
            <Box component="dt" sx={{ m: 0, color: t.inkMuted }}>Payment amount</Box>
            <Box component="dd" sx={{ m: 0, fontWeight: 600, color: t.ink }}>{inr(paymentAmount)}</Box>
          </Box>
          <Box sx={rowSx}>
            <Box component="dt" sx={{ m: 0, color: t.inkMuted }}>Processing fee (30%)</Box>
            <Box component="dd" sx={{ m: 0, fontWeight: 600, color: t.ink }}>− {inr(processingFee)}</Box>
          </Box>
          <Box sx={{ ...rowSx, borderBottom: 0, py: 1.5 }}>
            <Box component="dt" sx={{ m: 0, fontSize: 16, fontWeight: 700, color: t.ink }}>Eligible refund</Box>
            <Box component="dd" sx={{ m: 0, fontSize: 20, fontWeight: 800, color: t.ink }}>{inr(refundAmount)}</Box>
          </Box>
        </Box>
      </Box>

      {/* Policy notice */}
      <Box sx={{ ...railCardSx(t.statusDraft), fontSize: 14, lineHeight: 1.55, color: t.ink }}>
        Refund approval is at the sole discretion of Neram Classes. A 30% deduction applies to cover digital platform
        subscriptions and learning tool licenses purchased for you. This decision is final.
      </Box>

      {error && (
        <Box role="alert" sx={{ ...railCardSx(APPLY_ERROR), fontSize: 14, color: t.ink }}>
          {error}
        </Box>
      )}

      <TextField
        label="Why did you join Neram Classes?"
        placeholder="Please explain your original reason for enrolling"
        multiline
        rows={3}
        fullWidth
        required
        value={reasonForJoining}
        onChange={(e) => setReasonForJoining(e.target.value)}
        helperText={reasonForJoining.length < 10 ? 'Please provide at least 10 characters' : ''}
        error={reasonForJoining.length > 0 && reasonForJoining.length < 10}
      />

      <TextField
        label="Why do you want to discontinue?"
        placeholder="Please explain why you wish to request a refund"
        multiline
        rows={3}
        fullWidth
        required
        value={reasonForDiscontinuing}
        onChange={(e) => setReasonForDiscontinuing(e.target.value)}
        helperText={reasonForDiscontinuing.length < 10 ? 'Please provide at least 10 characters' : ''}
        error={reasonForDiscontinuing.length > 0 && reasonForDiscontinuing.length < 10}
      />

      <TextField
        label="Additional notes (optional)"
        placeholder="Any other information to support your request"
        multiline
        rows={2}
        fullWidth
        value={additionalNotes}
        onChange={(e) => setAdditionalNotes(e.target.value)}
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
          sx: { borderRadius: `${t.radius}px ${t.radius}px 0 0`, maxHeight: '92vh', bgcolor: t.surface },
          'aria-labelledby': 'refund-request-title',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }} aria-hidden>
          <Box sx={{ width: 40, height: 4, bgcolor: t.lineStrong, borderRadius: '2px' }} />
        </Box>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            pl: 2,
            pr: 1,
            py: 0.5,
            borderBottom: `1px solid ${t.line}`,
          }}
        >
          <Typography component="h2" id="refund-request-title" sx={titleSx}>
            Request a refund
          </Typography>
          <IconButton onClick={onClose} aria-label="Close" sx={closeSx}>
            <CloseOutlined />
          </IconButton>
        </Box>

        <Box sx={{ overflow: 'auto', px: 2, py: 2.5 }}>{content}</Box>

        <Box sx={{ display: 'flex', gap: 1, px: 2, py: 1.5, borderTop: `1px solid ${t.line}` }}>
          <Button variant="outlined" onClick={onClose} fullWidth disabled={isSubmitting} sx={secondarySx}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSubmit} fullWidth disabled={!canSubmit || isSubmitting} sx={primarySx}>
            {isSubmitting ? 'Submitting' : 'Submit request'}
          </Button>
        </Box>
      </SwipeableDrawer>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="refund-request-title">
      <DialogTitle
        component="div"
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 2,
          pr: 1.5,
          borderBottom: `1px solid ${t.line}`,
        }}
      >
        <Typography component="h2" id="refund-request-title" sx={titleSx}>
          Request a refund
        </Typography>
        <IconButton onClick={onClose} aria-label="Close" sx={closeSx}>
          <CloseOutlined />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: '24px !important' }}>{content}</DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1, borderTop: `1px solid ${t.line}` }}>
        <Button variant="outlined" onClick={onClose} disabled={isSubmitting} sx={secondarySx}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit || isSubmitting} sx={primarySx}>
          {isSubmitting ? 'Submitting' : 'Submit refund request'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
