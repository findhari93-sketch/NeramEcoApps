'use client';

import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@neram/ui';
import PaymentIcon from '@mui/icons-material/Payment';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ReceiptIcon from '@mui/icons-material/Receipt';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ReceiptDownload from './ReceiptDownload';
import type { UserJourneyDetail } from '@neram/database';

interface PaymentSectionProps {
  detail: UserJourneyDetail;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const STATUS_CONFIG: Record<string, { color: string; bgColor: string }> = {
  paid: { color: '#2E7D32', bgColor: '#2E7D3214' },
  pending: { color: '#F57C00', bgColor: '#F57C0014' },
  failed: { color: '#D32F2F', bgColor: '#D32F2F14' },
  refunded: { color: '#78909C', bgColor: '#78909C14' },
  overdue: { color: '#D32F2F', bgColor: '#D32F2F14' },
  waived: { color: '#78909C', bgColor: '#78909C14' },
};

export default function PaymentSection({ detail }: PaymentSectionProps) {
  const { payments, installments, leadProfile } = detail;

  const totalPaid = payments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0);

  const feeDue = leadProfile?.final_fee ? Math.max(0, leadProfile.final_fee - totalPaid) : 0;

  return (
    <Paper elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: 'grey.200', borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'grey.100', bgcolor: 'grey.50' }}>
        <PaymentIcon sx={{ color: 'primary.main', fontSize: 20 }} />
        <Typography variant="subtitle1" fontWeight={700}>Payments</Typography>
        <Chip
          label={`${payments.length} transaction${payments.length !== 1 ? 's' : ''}`}
          size="small"
          sx={{ height: 20, fontSize: 10, fontWeight: 700, bgcolor: 'grey.200', color: 'text.secondary', borderRadius: 1, ml: 'auto' }}
        />
      </Box>

      <Box sx={{ p: 2.5 }}>
        {/* Summary Cards */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2.5 }}>
          <Box sx={{
            flex: 1, p: 2, borderRadius: 2, bgcolor: '#E8F5E9', border: '1px solid #C8E6C9',
            display: 'flex', flexDirection: 'column', gap: 0.5,
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <AccountBalanceWalletIcon sx={{ fontSize: 16, color: '#2E7D32' }} />
              <Typography variant="caption" sx={{ color: '#2E7D32', fontWeight: 600, fontSize: 10.5, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Total Paid
              </Typography>
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 800, color: '#1B5E20', fontFamily: 'monospace', fontSize: 20 }}>
              {formatCurrency(totalPaid)}
            </Typography>
          </Box>

          {leadProfile?.final_fee ? (
            <Box sx={{
              flex: 1, p: 2, borderRadius: 2,
              bgcolor: feeDue > 0 ? '#FFF3E0' : '#E8F5E9',
              border: `1px solid ${feeDue > 0 ? '#FFE0B2' : '#C8E6C9'}`,
              display: 'flex', flexDirection: 'column', gap: 0.5,
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <TrendingUpIcon sx={{ fontSize: 16, color: feeDue > 0 ? '#E65100' : '#2E7D32' }} />
                <Typography variant="caption" sx={{ color: feeDue > 0 ? '#E65100' : '#2E7D32', fontWeight: 600, fontSize: 10.5, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  Balance Due
                </Typography>
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 800, color: feeDue > 0 ? '#BF360C' : '#1B5E20', fontFamily: 'monospace', fontSize: 20 }}>
                {formatCurrency(feeDue)}
              </Typography>
            </Box>
          ) : (
            <Box sx={{
              flex: 1, p: 2, borderRadius: 2, bgcolor: 'grey.50', border: '1px solid', borderColor: 'grey.200',
              display: 'flex', flexDirection: 'column', gap: 0.5,
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <ReceiptIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: 10.5, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  Transactions
                </Typography>
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 800, color: 'text.primary', fontSize: 20 }}>
                {payments.length}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Payment Mode & Coupon Info */}
        {leadProfile && (
          <Box sx={{ display: 'flex', gap: 2, mb: 2.5, flexWrap: 'wrap' }}>
            {/* Allowed Payment Mode */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                Student Payment Options:
              </Typography>
              <Chip
                label={leadProfile.allowed_payment_modes === 'full_only' ? 'Full Payment Only' : 'Full + Installment'}
                size="small"
                color={leadProfile.allowed_payment_modes === 'full_only' ? 'warning' : 'primary'}
                sx={{ height: 22, fontSize: 10.5, fontWeight: 600 }}
              />
            </Box>

            {/* Coupon Code */}
            {leadProfile.coupon_code && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LocalOfferIcon sx={{ fontSize: 14, color: 'success.main' }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                  Coupon:
                </Typography>
                <Chip
                  label={leadProfile.coupon_code}
                  size="small"
                  color="success"
                  variant="outlined"
                  sx={{ height: 22, fontSize: 11, fontWeight: 700, fontFamily: 'monospace' }}
                />
                <Tooltip title="Copy coupon code">
                  <IconButton
                    size="small"
                    onClick={() => navigator.clipboard.writeText(leadProfile.coupon_code || '')}
                    sx={{ p: 0.25 }}
                  >
                    <ContentCopyIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            )}

            {/* Full Payment Discount */}
            {leadProfile.full_payment_discount && Number(leadProfile.full_payment_discount) > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                  Full Pay Discount:
                </Typography>
                <Chip
                  label={formatCurrency(Number(leadProfile.full_payment_discount))}
                  size="small"
                  color="success"
                  sx={{ height: 22, fontSize: 10.5, fontWeight: 600 }}
                />
              </Box>
            )}
          </Box>
        )}

        <Divider sx={{ mb: 2.5 }} />

        {/* Payments table */}
        {payments.length > 0 ? (
          <TableContainer sx={{ borderRadius: 2, border: '1px solid', borderColor: 'grey.200', overflow: 'hidden' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', py: 1.25 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', py: 1.25 }}>Amount</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', py: 1.25 }}>Method</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', py: 1.25 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', py: 1.25 }}>Receipt</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {payments.map((payment) => {
                  const config = STATUS_CONFIG[payment.status] || STATUS_CONFIG.pending;
                  return (
                    <TableRow key={payment.id} sx={{ '&:hover': { bgcolor: 'action.hover' }, '&:last-child td': { borderBottom: 0 } }}>
                      <TableCell sx={{ fontSize: 12.5, py: 1.25 }}>{formatDate(payment.paid_at || payment.created_at)}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12.5, py: 1.25 }}>{formatCurrency(payment.amount)}</TableCell>
                      <TableCell sx={{ fontSize: 12.5, py: 1.25, textTransform: 'capitalize' }}>{payment.payment_method || '--'}</TableCell>
                      <TableCell sx={{ py: 1.25 }}>
                        <Chip
                          label={payment.status}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: 'capitalize',
                            bgcolor: config.bgColor,
                            color: config.color,
                            borderRadius: 1,
                            border: `1px solid ${config.color}30`,
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ py: 1.25 }}>
                        {payment.status === 'paid' && payment.receipt_number ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11, color: 'text.secondary' }}>
                              {payment.receipt_number}
                            </Typography>
                            <ReceiptDownload
                              receiptData={{
                                receiptNumber: payment.receipt_number,
                                amount: payment.amount,
                                razorpayPaymentId: payment.razorpay_payment_id || undefined,
                                paidAt: payment.paid_at || payment.created_at,
                                courseName: leadProfile?.interest_course || 'Neram Classes Course',
                                paymentScheme: (payment as any).payment_scheme,
                              }}
                              studentName={detail.user.name || 'Student'}
                              iconOnly
                            />
                          </Box>
                        ) : (
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11, color: 'text.secondary' }}>
                            {payment.receipt_number || '--'}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <PaymentIcon sx={{ fontSize: 36, color: 'grey.300', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">No payments recorded yet.</Typography>
          </Box>
        )}

        {/* Installments */}
        {installments.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <CalendarMonthIcon sx={{ fontSize: 16, color: 'primary.main' }} />
              <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 1, color: 'text.secondary', fontSize: 10.5 }}>
                Installment Schedule
              </Typography>
            </Box>
            <TableContainer sx={{ borderRadius: 2, border: '1px solid', borderColor: 'grey.200', overflow: 'hidden' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', py: 1.25 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', py: 1.25 }}>Due Date</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', py: 1.25 }}>Amount</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', py: 1.25 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', py: 1.25 }}>Late Fee</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {installments.map((inst) => {
                    const instStatus = inst.status === 'paid' ? 'paid' : inst.status === 'overdue' ? 'overdue' : inst.status === 'waived' ? 'waived' : 'pending';
                    const config = STATUS_CONFIG[instStatus] || STATUS_CONFIG.pending;
                    return (
                      <TableRow key={inst.id} sx={{ '&:hover': { bgcolor: 'action.hover' }, '&:last-child td': { borderBottom: 0 } }}>
                        <TableCell sx={{ fontWeight: 600, fontSize: 12.5, py: 1.25 }}>{inst.installment_number}</TableCell>
                        <TableCell sx={{ fontSize: 12.5, py: 1.25 }}>{formatDate(inst.due_date)}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12.5, py: 1.25 }}>{formatCurrency(inst.amount)}</TableCell>
                        <TableCell sx={{ py: 1.25 }}>
                          <Chip
                            label={inst.status}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: 10,
                              fontWeight: 700,
                              textTransform: 'capitalize',
                              bgcolor: config.bgColor,
                              color: config.color,
                              borderRadius: 1,
                              border: `1px solid ${config.color}30`,
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: 12.5, py: 1.25, fontFamily: 'monospace' }}>
                          {inst.late_fee > 0
                            ? <span style={{ color: inst.late_fee_waived ? '#78909C' : '#D32F2F' }}>
                                {formatCurrency(inst.late_fee)}{inst.late_fee_waived ? ' (waived)' : ''}
                              </span>
                            : <span style={{ color: '#bdbdbd' }}>--</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Box>
    </Paper>
  );
}
