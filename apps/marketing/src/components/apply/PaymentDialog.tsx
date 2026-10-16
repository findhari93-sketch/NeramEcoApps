// @ts-nocheck
'use client';

import { useCallback, useState } from 'react';
import { Box, Typography, Dialog, DialogTitle, DialogContent, SwipeableDrawer, IconButton } from '@neram/ui';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import { useIsMobile } from '@neram/ui/hooks';
import { tokens as t } from '@/design-system';
import PaymentPanel, { type PaymentPanelState } from './PaymentPanel';

interface PaymentDialogProps {
  open: boolean;
  leadId: string | null;
  onClose: () => void;
  onPaymentComplete?: () => void;
}

const closeSx = {
  width: 44,
  height: 44,
  color: t.ink,
  '&.Mui-focusVisible, &:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
} as const;
const titleSx = { m: 0, fontSize: '1.25rem', fontWeight: 800, color: t.ink } as const;

/**
 * The returning-user "Pay" door from the applications dashboard: the same
 * PaymentPanel the Pay and enrol step renders inline, wrapped in a bottom
 * sheet on phones and a dialog on desktop.
 */
export default function PaymentDialog({ open, leadId, onClose, onPaymentComplete }: PaymentDialogProps) {
  const isMobile = useIsMobile();
  const [state, setState] = useState<PaymentPanelState>({ paymentSuccess: false, isProcessing: false, enrolled: false });

  const handleClose = useCallback(() => {
    if (state.paymentSuccess) onPaymentComplete?.();
    onClose();
  }, [state.paymentSuccess, onPaymentComplete, onClose]);

  const title = state.paymentSuccess || state.enrolled ? 'Payment complete' : 'Complete payment';
  const panel = (
    <PaymentPanel
      leadId={leadId}
      active={open}
      variant="dialog"
      onPaymentComplete={onPaymentComplete}
      onStateChange={setState}
    />
  );

  if (isMobile) {
    return (
      <SwipeableDrawer
        anchor="bottom"
        open={open}
        onClose={handleClose}
        onOpen={() => {}}
        disableSwipeToOpen
        PaperProps={{
          sx: {
            maxHeight: '92vh',
            borderTopLeftRadius: t.radius,
            borderTopRightRadius: t.radius,
            overflow: 'hidden',
            bgcolor: t.surface,
          },
          'aria-labelledby': 'payment-dialog-title',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }} aria-hidden>
          <Box sx={{ width: 40, height: 4, borderRadius: '2px', bgcolor: t.lineStrong }} />
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
          <Typography component="h2" id="payment-dialog-title" sx={titleSx}>{title}</Typography>
          <IconButton onClick={handleClose} disabled={state.isProcessing} aria-label="Close" sx={closeSx}>
            <CloseOutlined />
          </IconButton>
        </Box>
        <Box sx={{ overflow: 'auto', px: 2, pt: 2.5, pb: 3 }}>{panel}</Box>
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
      aria-labelledby="payment-dialog-title"
      PaperProps={{ sx: { maxHeight: '90vh' } }}
    >
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
        <Typography component="h2" id="payment-dialog-title" sx={titleSx}>{title}</Typography>
        <IconButton onClick={handleClose} disabled={state.isProcessing} aria-label="Close" sx={closeSx}>
          <CloseOutlined />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: '24px !important', pb: 3 }}>{panel}</DialogContent>
    </Dialog>
  );
}
