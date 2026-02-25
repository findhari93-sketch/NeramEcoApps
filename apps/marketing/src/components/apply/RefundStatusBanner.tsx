'use client';

import { Box, Typography, Chip, Alert, Divider } from '@neram/ui';
import type { RefundRequest } from '@neram/database';

interface RefundStatusBannerProps {
  refundRequest: RefundRequest;
}

const STATUS_CONFIG = {
  pending: {
    chipLabel: 'Refund Pending',
    chipColor: 'warning' as const,
    alertSeverity: 'info' as const,
    message: 'Your refund request is under review. We will notify you once a decision is made.',
  },
  approved: {
    chipLabel: 'Refund Approved',
    chipColor: 'success' as const,
    alertSeverity: 'success' as const,
    message: 'Your refund has been approved! The amount will be credited to your original payment method within 5-10 business days.',
  },
  rejected: {
    chipLabel: 'Refund Rejected',
    chipColor: 'error' as const,
    alertSeverity: 'error' as const,
    message: 'Your refund request was not approved.',
  },
};

export default function RefundStatusBanner({ refundRequest }: RefundStatusBannerProps) {
  const config = STATUS_CONFIG[refundRequest.status] || STATUS_CONFIG.pending;
  const requestDate = refundRequest.created_at
    ? new Date(refundRequest.created_at).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <Box
      sx={{
        mt: 1.5,
        p: 2,
        borderRadius: 2,
        bgcolor: refundRequest.status === 'approved'
          ? '#E8F5E9'
          : refundRequest.status === 'rejected'
            ? '#FFEBEE'
            : '#FFF3E0',
        border: '1px solid',
        borderColor: refundRequest.status === 'approved'
          ? 'success.light'
          : refundRequest.status === 'rejected'
            ? 'error.light'
            : 'warning.light',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2" fontWeight={700}>
          Refund Request
        </Typography>
        <Chip label={config.chipLabel} color={config.chipColor} size="small" sx={{ fontWeight: 600, fontSize: '0.7rem' }} />
      </Box>

      {requestDate && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          Requested on {requestDate}
        </Typography>
      )}

      {/* Refund calculation summary */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2" color="text.secondary">Payment Amount</Typography>
        <Typography variant="body2">Rs. {Number(refundRequest.payment_amount).toLocaleString('en-IN')}</Typography>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2" color="text.secondary">Processing Fee (30%)</Typography>
        <Typography variant="body2" color="error.main">- Rs. {Number(refundRequest.processing_fee).toLocaleString('en-IN')}</Typography>
      </Box>
      <Divider sx={{ my: 0.75 }} />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="body2" fontWeight={600}>
          {refundRequest.status === 'approved' ? 'Refund Amount' : 'Eligible Refund'}
        </Typography>
        <Typography variant="body2" fontWeight={600} color="success.dark">
          Rs. {Number(refundRequest.refund_amount).toLocaleString('en-IN')}
        </Typography>
      </Box>

      <Alert severity={config.alertSeverity} sx={{ fontSize: 12 }}>
        {config.message}
      </Alert>

      {/* Show admin notes if rejected */}
      {refundRequest.status === 'rejected' && refundRequest.admin_notes && (
        <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'background.paper', borderRadius: 1 }}>
          <Typography variant="caption" fontWeight={600} display="block" sx={{ mb: 0.5 }}>
            Reason:
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
            {refundRequest.admin_notes}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
