'use client';

import { useState, useEffect } from 'react';
import { Button, CircularProgress } from '@neram/ui';
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
}

export default function RefundRequestButton({
  paymentId,
  paidAt,
  paymentAmount,
  leadProfileId,
  onRequestSubmitted,
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
        const res = await fetch(`/api/refund/status/${paymentId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.refundRequest) {
            setExistingRequest(data.refundRequest);
          }
        }
      } catch {
        // Ignore errors — just show the button
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

  return (
    <>
      <Button
        variant="outlined"
        color="error"
        size="small"
        onClick={() => setDialogOpen(true)}
        sx={{ mt: 1, fontWeight: 600 }}
      >
        Request Refund
      </Button>

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
