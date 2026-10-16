'use client';

import { Box, Typography } from '@neram/ui';
import type { RefundRequest } from '@neram/database';
import { tokens as t } from '@/design-system';
import { railCardSx } from './styles';
import { APPLY_ERROR } from './shell/applyTheme';

interface RefundStatusBannerProps {
  refundRequest: RefundRequest;
}

const STATUS_CONFIG = {
  pending: {
    chipLabel: 'Refund pending',
    rail: t.statusDraft,
    dot: t.statusDraft,
    message: 'Your refund request is under review. We will notify you once a decision is made.',
  },
  approved: {
    chipLabel: 'Refund approved',
    rail: t.success,
    dot: t.statusDone,
    message: 'Your refund has been approved. The amount will be credited to your original payment method within 5 to 10 business days.',
  },
  rejected: {
    chipLabel: 'Refund rejected',
    rail: APPLY_ERROR,
    dot: APPLY_ERROR,
    message: 'Your refund request was not approved.',
  },
};

const inr = (n: number | string | null | undefined) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/** The refund request on an enrolled application: a white card with a status rail. */
export default function RefundStatusBanner({ refundRequest }: RefundStatusBannerProps) {
  const config = STATUS_CONFIG[refundRequest.status] || STATUS_CONFIG.pending;
  const requestDate = refundRequest.created_at
    ? new Date(refundRequest.created_at).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  const rowSx = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 2,
    py: 1,
    borderBottom: `1px solid ${t.line}`,
    fontSize: 14,
  } as const;

  return (
    <Box sx={{ ...railCardSx(config.rail), color: t.ink }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 0.5 }}>
        <Typography component="h3" sx={{ m: 0, fontSize: 15, fontWeight: 700, color: t.ink }}>
          Refund request
        </Typography>
        <Box
          component="span"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: '5px',
            borderRadius: `${t.radiusPill}px`,
            border: `1px solid ${t.line}`,
            bgcolor: t.ground,
            fontSize: 13,
            fontWeight: 700,
            color: t.ink,
          }}
        >
          <Box component="span" aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: config.dot }} />
          {config.chipLabel}
        </Box>
      </Box>

      {requestDate && (
        <Typography component="p" sx={{ m: 0, mb: 1, fontSize: 13, color: t.inkMuted }}>
          Requested on {requestDate}
        </Typography>
      )}

      <Box component="dl" sx={{ m: 0, borderTop: `1px solid ${t.ink}` }}>
        <Box sx={rowSx}>
          <Box component="dt" sx={{ m: 0, color: t.inkMuted }}>Payment amount</Box>
          <Box component="dd" sx={{ m: 0, fontWeight: 600 }}>{inr(refundRequest.payment_amount)}</Box>
        </Box>
        <Box sx={rowSx}>
          <Box component="dt" sx={{ m: 0, color: t.inkMuted }}>Processing fee (30%)</Box>
          <Box component="dd" sx={{ m: 0, fontWeight: 600 }}>− {inr(refundRequest.processing_fee)}</Box>
        </Box>
        <Box sx={{ ...rowSx, borderBottom: 0 }}>
          <Box component="dt" sx={{ m: 0, fontWeight: 700 }}>
            {refundRequest.status === 'approved' ? 'Refund amount' : 'Eligible refund'}
          </Box>
          <Box component="dd" sx={{ m: 0, fontSize: 16, fontWeight: 800 }}>{inr(refundRequest.refund_amount)}</Box>
        </Box>
      </Box>

      <Typography component="p" sx={{ m: 0, mt: 1, fontSize: 14, lineHeight: 1.5, color: t.ink }}>
        {config.message}
      </Typography>

      {refundRequest.status === 'rejected' && refundRequest.admin_notes && (
        <Box sx={{ mt: 1.5, px: 1.75, py: 1.5, bgcolor: t.ground, border: `1px solid ${t.line}`, borderRadius: `${t.radius}px` }}>
          <Typography component="p" sx={{ m: 0, mb: 0.5, fontSize: 13, fontWeight: 700, color: t.ink }}>
            Reason
          </Typography>
          <Typography component="p" sx={{ m: 0, fontSize: 14, lineHeight: 1.5, color: t.inkMuted }}>
            {refundRequest.admin_notes}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
