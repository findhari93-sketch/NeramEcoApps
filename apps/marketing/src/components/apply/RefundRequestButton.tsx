'use client';

import { useState, useEffect } from 'react';
import { Box, Typography } from '@neram/ui';
import { tokens as t } from '@/design-system';
import { useFirebaseAuth } from '@neram/auth';
import RefundRequestDialog from './RefundRequestDialog';
import type { RefundRequest } from '@neram/database';

interface RefundRequestButtonProps {
  /** The payment ID to request refund for */
  paymentId: string;
  /** The paid_at timestamp to check 24-hour window */
  paidAt: string;
  /** Payment amount for display */
  paymentAmount: number;
  /** Lead profile ID */
  leadProfileId: string;
  /** Called when refund request is successfully submitted */
  onRequestSubmitted?: () => void;
  /** The quiet sentence before the link. */
  lead?: string;
}

export default function RefundRequestButton({
  paymentId,
  paidAt,
  paymentAmount,
  leadProfileId,
  onRequestSubmitted,
  lead = 'Changed your mind? Refunds can be requested within 24 hours of payment.',
}: RefundRequestButtonProps) {
  const { user } = useFirebaseAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [existingRequest, setExistingRequest] = useState<RefundRequest | null>(null);
  const [loading, setLoading] = useState(true);

  // Check if within 24-hour window
  const paidTime = new Date(paidAt).getTime();
  const hoursElapsed = (Date.now() - paidTime) / (1000 * 60 * 60);
  const isWithinWindow = hoursElapsed <= 24;

  // Check for existing refund request
  useEffect(() => {
    if (!user || !paymentId) {
      setLoading(false);
      return;
    }

    async function checkExisting() {
      try {
        const idToken = await (user?.raw as any)?.getIdToken?.();
        const res = await fetch(`/api/refund/status/${paymentId}`, {
          headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
        });
        if (res.ok) {
          const data = await res.json();
          if (data.refundRequest) {
            setExistingRequest(data.refundRequest);
          }
        }
      } catch {
        // Ignore errors, just show the button
      } finally {
        setLoading(false);
      }
    }

    checkExisting();
  }, [user, paymentId]);

  // Don't render if outside window or if request already exists
  if (loading) return null;
  if (!isWithinWindow) return null;
  if (existingRequest) return null;

  // A 13px muted line with an underlined text link, never a red button.
  return (
    <>
      <Typography
        component="p"
        sx={{
          m: 0,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: 0.75,
          fontSize: 13,
          lineHeight: 1.45,
          color: t.inkMuted,
        }}
      >
        <span>{lead}</span>
        <Box
          component="button"
          type="button"
          onClick={() => setDialogOpen(true)}
          aria-haspopup="dialog"
          sx={{
            minHeight: 44,
            p: 0,
            border: 0,
            bgcolor: 'transparent',
            font: 'inherit',
            fontSize: 13,
            fontWeight: 600,
            color: t.ink,
            textDecoration: 'underline',
            textUnderlineOffset: '2px',
            cursor: 'pointer',
            '&:hover': { color: t.navy900 },
            '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
          }}
        >
          Request a refund
        </Box>
      </Typography>

      <RefundRequestDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        paymentId={paymentId}
        paymentAmount={paymentAmount}
        leadProfileId={leadProfileId}
        onSuccess={() => {
          setDialogOpen(false);
          setExistingRequest({} as RefundRequest); // Hide button after submission
          onRequestSubmitted?.();
        }}
      />
    </>
  );
}
