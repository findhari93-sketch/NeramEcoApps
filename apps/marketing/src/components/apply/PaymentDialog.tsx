// @ts-nocheck
'use client';

import { useCallback, useState } from 'react';
import { Box, Typography, Divider, Dialog, DialogTitle, DialogContent, SwipeableDrawer, IconButton } from '@neram/ui';
import { CloseIcon } from '@neram/ui';
import { useIsMobile } from '@neram/ui/hooks';
import PaymentPanel from './PaymentPanel';

interface PaymentDialogProps {
  open: boolean;
  leadId: string | null;
  onClose: () => void;
  onPaymentComplete?: () => void;
}

/**
 * The returning-user "Pay" door from the applications dashboard: the same
 * PaymentPanel the Pay and enrol step renders inline, wrapped in a bottom
 * sheet on phones and a dialog on desktop.
 */
export default function PaymentDialog({ open, leadId, onClose, onPaymentComplete }: PaymentDialogProps) {
  const isMobile = useIsMobile();
  const [state, setState] = useState({ paymentSuccess: false, isProcessing: false });

  const handleClose = useCallback(() => {
    if (state.paymentSuccess) onPaymentComplete?.();
    onClose();
  }, [state.paymentSuccess, onPaymentComplete, onClose]);

  const title = state.paymentSuccess ? 'Payment complete' : 'Complete payment';
  const panel = (
    <PaymentPanel leadId={leadId} active={open} onPaymentComplete={onPaymentComplete} onStateChange={setState} />
  );

  if (isMobile) {
    return (
      <SwipeableDrawer
        anchor="bottom"
        open={open}
        onClose={handleClose}
        onOpen={() => {}}
        disableSwipeToOpen
        PaperProps={{ sx: { maxHeight: '92vh', borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' } }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1, pb: 0.5 }}>
          <Box sx={{ width: 36, height: 4, borderRadius: 1, bgcolor: 'grey.300' }} />
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, pb: 1 }}>
          <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
          <IconButton size="small" onClick={handleClose} aria-label="Close" sx={{ minWidth: 44, minHeight: 44 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <Divider />
        <Box sx={{ overflow: 'auto', px: 2, pt: 2, pb: 3 }}>{panel}</Box>
      </SwipeableDrawer>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={state.isProcessing ? undefined : handleClose}
      maxWidth="sm"
      fullWidth
      scroll="paper"
      PaperProps={{ sx: { borderRadius: 1.5, maxHeight: '90vh' } }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Typography variant="h6" component="span" fontWeight={700}>{title}</Typography>
        <IconButton size="small" onClick={handleClose} disabled={state.isProcessing} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 2.5 }}>{panel}</DialogContent>
    </Dialog>
  );
}
