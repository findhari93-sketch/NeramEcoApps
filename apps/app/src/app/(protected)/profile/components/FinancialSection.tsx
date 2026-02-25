'use client';

import { Box, Typography, Chip, Divider, useTheme, useMediaQuery } from '@neram/ui';
import InfoRow from './InfoRow';
import ReceiptDownload from './ReceiptDownload';
import type { LeadProfile, Payment, PaymentInstallment } from '@neram/database';

interface FinancialSectionProps {
  leadProfile: LeadProfile | null;
  payments: Payment[];
  installments: PaymentInstallment[];
  courseName: string | null;
  studentName: string;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatCurrency(amount: number | null): string | null {
  if (amount === null || amount === undefined) return null;
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

const PAYMENT_STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  paid: 'success',
  pending: 'warning',
  failed: 'error',
  refunded: 'default',
};

const METHOD_LABELS: Record<string, string> = {
  razorpay: 'Online (Razorpay)',
  upi_screenshot: 'UPI Screenshot',
  bank_transfer: 'Bank Transfer',
};

export default function FinancialSection({
  leadProfile,
  payments,
  installments,
  courseName,
  studentName,
}: FinancialSectionProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const hasFeeData = leadProfile && leadProfile.final_fee != null;
  const hasPayments = payments.length > 0;
  const hasInstallments = installments.length > 0;

  if (!hasFeeData && !hasPayments) return null;

  return (
    <Box>
      {/* Fee Summary */}
      {hasFeeData && (
        <Box sx={{ mb: hasPayments ? 2 : 0 }}>
          <InfoRow label="Total Fee" value={formatCurrency(leadProfile!.final_fee)} />
          {leadProfile!.payment_scheme && (
            <InfoRow
              label="Payment Plan"
              value={leadProfile!.payment_scheme === 'full' ? 'Full Payment' : 'Installment'}
            />
          )}
          {leadProfile!.full_payment_discount != null && leadProfile!.full_payment_discount > 0 && (
            <InfoRow label="Full Payment Discount" value={formatCurrency(leadProfile!.full_payment_discount)} />
          )}
          {leadProfile!.coupon_code && (
            <InfoRow label="Coupon Applied" value={leadProfile!.coupon_code} />
          )}
          {leadProfile!.total_cashback_eligible > 0 && (
            <InfoRow label="Cashback Eligible" value={formatCurrency(leadProfile!.total_cashback_eligible)} />
          )}
        </Box>
      )}

      {/* Installment Schedule */}
      {hasInstallments && (
        <Box sx={{ mb: hasPayments ? 2 : 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Installment Schedule
          </Typography>
          {installments.map((inst) => (
            <Box
              key={inst.id}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                py: 0.75,
                '&:not(:last-child)': { borderBottom: '1px solid', borderColor: 'divider' },
              }}
            >
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  Installment {inst.installment_number}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Due: {formatDate(inst.due_date)}
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {formatCurrency(inst.amount)}
                </Typography>
                <Chip
                  label={inst.status}
                  size="small"
                  color={inst.status === 'paid' ? 'success' : inst.status === 'overdue' ? 'error' : 'warning'}
                  sx={{ mt: 0.25 }}
                />
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* Payment History */}
      {hasPayments && (
        <Box>
          {(hasFeeData || hasInstallments) && <Divider sx={{ my: 1.5 }} />}
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Payment History
          </Typography>
          {payments.map((payment) => (
            <Box
              key={payment.id}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                py: 1,
                '&:not(:last-child)': { borderBottom: '1px solid', borderColor: 'divider' },
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {formatCurrency(payment.amount)}
                  </Typography>
                  <Chip
                    label={payment.status}
                    size="small"
                    color={PAYMENT_STATUS_COLORS[payment.status] || 'default'}
                  />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {formatDate(payment.paid_at || payment.created_at)}
                  {payment.payment_method && ` · ${METHOD_LABELS[payment.payment_method] || payment.payment_method}`}
                </Typography>
                {payment.receipt_number && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Receipt: {payment.receipt_number}
                  </Typography>
                )}
              </Box>
              {payment.status === 'paid' && payment.receipt_number && (
                <Box sx={{ flexShrink: 0, ml: 1 }}>
                  <ReceiptDownload
                    receiptData={{
                      receiptNumber: payment.receipt_number,
                      amount: payment.amount,
                      razorpayPaymentId: payment.razorpay_payment_id || undefined,
                      paidAt: payment.paid_at || payment.created_at,
                      courseName: courseName || 'Neram Classes Course',
                      paymentScheme: (payment as any).payment_scheme,
                    }}
                    studentName={studentName}
                    iconOnly={isMobile}
                    variant="text"
                    size="small"
                  />
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
