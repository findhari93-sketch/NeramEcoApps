// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Button,
  Grid,
  Divider,
  Alert,
  CircularProgress,
  Avatar,
  Breadcrumbs,
  Link as MuiLink,
  Tooltip,
  Skeleton,
  IconButton,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PaymentsIcon from '@mui/icons-material/Payments';
import PersonIcon from '@mui/icons-material/Person';
import ReceiptIcon from '@mui/icons-material/Receipt';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import TimelineIcon from '@mui/icons-material/Timeline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import PendingIcon from '@mui/icons-material/Pending';
import ReplayIcon from '@mui/icons-material/Replay';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

interface PaymentDetail {
  id: string;
  user_id: string;
  student_profile_id: string | null;
  lead_profile_id: string | null;
  amount: number;
  currency: string;
  status: string;
  payment_method: string | null;
  description: string | null;

  // Razorpay
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_signature: string | null;
  razorpay_method: string | null;
  razorpay_bank: string | null;
  razorpay_vpa: string | null;
  razorpay_card_last4: string | null;
  razorpay_card_network: string | null;
  razorpay_fee: number | null;
  razorpay_tax: number | null;

  // Receipt
  receipt_number: string | null;
  receipt_url: string | null;

  // Screenshot
  screenshot_url: string | null;
  screenshot_verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  verification_notes: string | null;

  // Installment
  installment_number: number | null;

  // Failure
  failure_code: string | null;
  failure_reason: string | null;

  // Timestamps
  paid_at: string | null;
  created_at: string;
  updated_at: string;

  // Metadata
  metadata: Record<string, unknown> | null;

  // Student info
  student_name: string;
  student_email: string | null;
  student_phone: string | null;
  student_avatar: string | null;
  student_user_type: string | null;

  // Lead profile info
  interest_course: string | null;
  application_number: string | null;
  applicant_category: string | null;
  application_status: string | null;
  assigned_fee: number | null;
  final_fee: number | null;
  payment_scheme: string | null;
  coupon_code: string | null;
  discount_amount: number | null;
  city: string | null;
  state: string | null;

  // Related
  course_name: string | null;
  fee_structure_name: string | null;
  installments: any[];
}

function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return '-';
  return `Rs. ${amount.toLocaleString('en-IN')}`;
}

function formatDateTime(dateString: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getStatusColor(status: string): 'success' | 'warning' | 'error' | 'default' {
  switch (status) {
    case 'paid':
      return 'success';
    case 'pending':
      return 'warning';
    case 'failed':
      return 'error';
    case 'refunded':
      return 'default';
    default:
      return 'default';
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'paid':
      return <CheckCircleIcon sx={{ fontSize: 18 }} />;
    case 'pending':
      return <PendingIcon sx={{ fontSize: 18 }} />;
    case 'failed':
      return <ErrorIcon sx={{ fontSize: 18 }} />;
    case 'refunded':
      return <ReplayIcon sx={{ fontSize: 18 }} />;
    default:
      return null;
  }
}

function getMethodLabel(method: string | null): string {
  switch (method) {
    case 'razorpay':
      return 'Razorpay';
    case 'upi_direct':
      return 'UPI Direct';
    case 'upi_screenshot':
      return 'UPI Screenshot';
    case 'bank_transfer':
      return 'Bank Transfer';
    default:
      return method || 'Unknown';
  }
}

function getRazorpayMethodLabel(method: string | null): string {
  switch (method) {
    case 'upi':
      return 'UPI';
    case 'card':
      return 'Card';
    case 'netbanking':
      return 'Net Banking';
    case 'wallet':
      return 'Wallet';
    case 'emi':
      return 'EMI';
    default:
      return method || '-';
  }
}

function getCourseLabel(course: string | null): string {
  switch (course) {
    case 'nata':
      return 'NATA';
    case 'jee_paper2':
      return 'JEE Paper 2';
    case 'both':
      return 'Both (Combo)';
    case 'not_sure':
      return 'Not Sure';
    default:
      return course || '-';
  }
}

function getInstallmentStatusColor(status: string): 'success' | 'warning' | 'error' | 'default' | 'info' {
  switch (status) {
    case 'paid':
      return 'success';
    case 'pending':
      return 'warning';
    case 'overdue':
      return 'error';
    case 'waived':
      return 'info';
    default:
      return 'default';
  }
}

// Detail row component
function DetailRow({
  label,
  value,
  mono,
  copyable,
  link,
}: {
  label: string;
  value: string | React.ReactNode;
  mono?: boolean;
  copyable?: boolean;
  link?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (typeof value === 'string') {
      navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', py: 1 }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 140, flexShrink: 0 }}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, textAlign: 'right' }}>
        {link && typeof value === 'string' ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#1565C0', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Typography
              variant="body2"
              fontWeight={500}
              sx={mono ? { fontFamily: 'monospace', fontSize: '0.8rem' } : {}}
            >
              {value}
            </Typography>
            <OpenInNewIcon sx={{ fontSize: 14, color: '#1565C0' }} />
          </a>
        ) : (
          <Typography
            variant="body2"
            fontWeight={500}
            sx={mono ? { fontFamily: 'monospace', fontSize: '0.8rem' } : {}}
          >
            {value || '-'}
          </Typography>
        )}
        {copyable && typeof value === 'string' && value !== '-' && (
          <Tooltip title={copied ? 'Copied!' : 'Copy'}>
            <IconButton size="small" onClick={handleCopy} sx={{ ml: 0.5, p: 0.25 }}>
              <ContentCopyIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}

// Section card component
function SectionCard({
  title,
  icon,
  children,
  headerAction,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  headerAction?: React.ReactNode;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'grey.200',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'grey.100',
          bgcolor: 'grey.50',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {icon}
          <Typography variant="subtitle1" fontWeight={600}>
            {title}
          </Typography>
        </Box>
        {headerAction}
      </Box>
      <Box sx={{ p: 1.5 }}>{children}</Box>
    </Paper>
  );
}

export default function PaymentDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchPayment = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/payments/${params.id}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error('Payment not found');
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to fetch payment (HTTP ${res.status})`);
      }

      const data = await res.json();
      setPayment(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch payment');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchPayment();
  }, [fetchPayment]);

  if (loading) {
    return (
      <Box>
        <Skeleton width={300} height={32} sx={{ mb: 2 }} />
        <Skeleton width="100%" height={200} sx={{ mb: 2, borderRadius: 1 }} />
        <Grid container spacing={2}>
          <Grid item xs={12} md={8}>
            <Skeleton width="100%" height={400} sx={{ borderRadius: 1 }} />
          </Grid>
          <Grid item xs={12} md={4}>
            <Skeleton width="100%" height={300} sx={{ borderRadius: 1 }} />
          </Grid>
        </Grid>
      </Box>
    );
  }

  if (error || !payment) {
    return (
      <Box>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push('/payments')}
          sx={{ mb: 2 }}
        >
          Back to Payments
        </Button>
        <Alert severity="error">{error || 'Payment not found'}</Alert>
      </Box>
    );
  }

  // Build timeline events
  const timelineEvents: { label: string; date: string; status: string; description?: string }[] = [];

  timelineEvents.push({
    label: 'Payment Created',
    date: payment.created_at,
    status: 'created',
    description: payment.description || `${getMethodLabel(payment.payment_method)} payment initiated`,
  });

  if (payment.paid_at) {
    timelineEvents.push({
      label: 'Payment Completed',
      date: payment.paid_at,
      status: 'paid',
      description: payment.razorpay_payment_id
        ? `Razorpay ID: ${payment.razorpay_payment_id}`
        : 'Payment marked as paid',
    });
  }

  if (payment.status === 'failed') {
    timelineEvents.push({
      label: 'Payment Failed',
      date: payment.updated_at,
      status: 'failed',
      description: payment.failure_reason || payment.failure_code || 'Payment failed',
    });
  }

  if (payment.screenshot_verified && payment.verified_at) {
    timelineEvents.push({
      label: 'Screenshot Verified',
      date: payment.verified_at,
      status: 'verified',
      description: payment.verification_notes || 'Screenshot was verified by admin',
    });
  }

  if (payment.status === 'refunded') {
    timelineEvents.push({
      label: 'Payment Refunded',
      date: payment.updated_at,
      status: 'refunded',
      description: 'Payment was refunded',
    });
  }

  // Sort timeline by date
  timelineEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <Box>
      {/* Breadcrumb */}
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ mb: 2 }}>
        <MuiLink
          underline="hover"
          color="inherit"
          sx={{ cursor: 'pointer', fontSize: '0.875rem' }}
          onClick={() => router.push('/payments')}
        >
          Payments
        </MuiLink>
        <Typography color="text.primary" sx={{ fontSize: '0.875rem' }}>
          Payment Detail
        </Typography>
      </Breadcrumbs>

      {/* Back button + header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            onClick={() => router.push('/payments')}
            size="small"
          >
            Back
          </Button>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h5" fontWeight={700}>
                {formatCurrency(payment.amount)}
              </Typography>
              <Chip
                icon={getStatusIcon(payment.status)}
                label={payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                color={getStatusColor(payment.status)}
                size="small"
                sx={{ fontWeight: 600 }}
              />
            </Box>
            <Typography variant="body2" color="text.secondary">
              {payment.receipt_number ? `Receipt: ${payment.receipt_number}` : `ID: ${payment.id.slice(0, 8)}...`}
              {' | '}
              {formatDateTime(payment.created_at)}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Main content */}
      <Grid container spacing={2}>
        {/* Left column - Payment details */}
        <Grid item xs={12} md={8}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Payment Summary */}
            <SectionCard
              title="Payment Summary"
              icon={<PaymentsIcon sx={{ fontSize: 20, color: '#1565C0' }} />}
            >
              <DetailRow label="Amount" value={formatCurrency(payment.amount)} />
              <Divider sx={{ my: 0.5 }} />
              <DetailRow label="Status" value={
                <Chip
                  icon={getStatusIcon(payment.status)}
                  label={payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                  color={getStatusColor(payment.status)}
                  size="small"
                  sx={{ fontWeight: 500 }}
                />
              } />
              <Divider sx={{ my: 0.5 }} />
              <DetailRow label="Method" value={getMethodLabel(payment.payment_method)} />
              <Divider sx={{ my: 0.5 }} />
              <DetailRow label="Receipt #" value={payment.receipt_number || '-'} mono copyable />
              {payment.receipt_url && (
                <>
                  <Divider sx={{ my: 0.5 }} />
                  <DetailRow label="Receipt URL" value="View Receipt" link={payment.receipt_url} />
                </>
              )}
              <Divider sx={{ my: 0.5 }} />
              <DetailRow label="Created" value={formatDateTime(payment.created_at)} />
              {payment.paid_at && (
                <>
                  <Divider sx={{ my: 0.5 }} />
                  <DetailRow label="Paid At" value={formatDateTime(payment.paid_at)} />
                </>
              )}
              {payment.description && (
                <>
                  <Divider sx={{ my: 0.5 }} />
                  <DetailRow label="Description" value={payment.description} />
                </>
              )}
              {payment.installment_number && (
                <>
                  <Divider sx={{ my: 0.5 }} />
                  <DetailRow label="Installment #" value={String(payment.installment_number)} />
                </>
              )}
              {payment.coupon_code && (
                <>
                  <Divider sx={{ my: 0.5 }} />
                  <DetailRow label="Coupon Code" value={payment.coupon_code} mono />
                </>
              )}
              {payment.discount_amount && payment.discount_amount > 0 && (
                <>
                  <Divider sx={{ my: 0.5 }} />
                  <DetailRow label="Discount" value={formatCurrency(payment.discount_amount)} />
                </>
              )}
            </SectionCard>

            {/* Razorpay Details */}
            {(payment.razorpay_order_id || payment.razorpay_payment_id) && (
              <SectionCard
                title="Razorpay Details"
                icon={<AccountBalanceIcon sx={{ fontSize: 20, color: '#1565C0' }} />}
              >
                <DetailRow label="Order ID" value={payment.razorpay_order_id || '-'} mono copyable />
                <Divider sx={{ my: 0.5 }} />
                <DetailRow label="Payment ID" value={payment.razorpay_payment_id || '-'} mono copyable />
                {payment.razorpay_method && (
                  <>
                    <Divider sx={{ my: 0.5 }} />
                    <DetailRow label="Payment Method" value={getRazorpayMethodLabel(payment.razorpay_method)} />
                  </>
                )}
                {payment.razorpay_bank && (
                  <>
                    <Divider sx={{ my: 0.5 }} />
                    <DetailRow label="Bank" value={payment.razorpay_bank} />
                  </>
                )}
                {payment.razorpay_vpa && (
                  <>
                    <Divider sx={{ my: 0.5 }} />
                    <DetailRow label="UPI ID (VPA)" value={payment.razorpay_vpa} mono copyable />
                  </>
                )}
                {payment.razorpay_card_last4 && (
                  <>
                    <Divider sx={{ my: 0.5 }} />
                    <DetailRow
                      label="Card"
                      value={`${payment.razorpay_card_network || ''} **** ${payment.razorpay_card_last4}`}
                    />
                  </>
                )}
                {payment.razorpay_fee !== null && payment.razorpay_fee !== undefined && (
                  <>
                    <Divider sx={{ my: 0.5 }} />
                    <DetailRow label="Processing Fee" value={formatCurrency(payment.razorpay_fee / 100)} />
                  </>
                )}
                {payment.razorpay_tax !== null && payment.razorpay_tax !== undefined && (
                  <>
                    <Divider sx={{ my: 0.5 }} />
                    <DetailRow label="Tax (GST)" value={formatCurrency(payment.razorpay_tax / 100)} />
                  </>
                )}
                {payment.razorpay_signature && (
                  <>
                    <Divider sx={{ my: 0.5 }} />
                    <DetailRow
                      label="Signature"
                      value={payment.razorpay_signature.slice(0, 20) + '...'}
                      mono
                      copyable={false}
                    />
                  </>
                )}
              </SectionCard>
            )}

            {/* Failure Details */}
            {payment.status === 'failed' && (payment.failure_code || payment.failure_reason) && (
              <SectionCard
                title="Failure Details"
                icon={<ErrorIcon sx={{ fontSize: 20, color: '#C62828' }} />}
              >
                {payment.failure_code && (
                  <DetailRow label="Error Code" value={payment.failure_code} mono />
                )}
                {payment.failure_reason && (
                  <>
                    {payment.failure_code && <Divider sx={{ my: 0.5 }} />}
                    <DetailRow label="Reason" value={payment.failure_reason} />
                  </>
                )}
              </SectionCard>
            )}

            {/* Screenshot Verification */}
            {payment.payment_method === 'upi_screenshot' && (
              <SectionCard
                title="Screenshot Verification"
                icon={<ReceiptIcon sx={{ fontSize: 20, color: '#6A1B9A' }} />}
              >
                <DetailRow
                  label="Verified"
                  value={
                    <Chip
                      label={payment.screenshot_verified ? 'Verified' : 'Not Verified'}
                      color={payment.screenshot_verified ? 'success' : 'warning'}
                      size="small"
                    />
                  }
                />
                {payment.screenshot_url && (
                  <>
                    <Divider sx={{ my: 0.5 }} />
                    <DetailRow label="Screenshot" value="View Screenshot" link={payment.screenshot_url} />
                  </>
                )}
                {payment.verified_at && (
                  <>
                    <Divider sx={{ my: 0.5 }} />
                    <DetailRow label="Verified At" value={formatDateTime(payment.verified_at)} />
                  </>
                )}
                {payment.verification_notes && (
                  <>
                    <Divider sx={{ my: 0.5 }} />
                    <DetailRow label="Notes" value={payment.verification_notes} />
                  </>
                )}
              </SectionCard>
            )}

            {/* Installment Schedule */}
            {payment.installments && payment.installments.length > 0 && (
              <SectionCard
                title="Installment Schedule"
                icon={<ReceiptIcon sx={{ fontSize: 20, color: '#00695C' }} />}
              >
                {payment.installments.map((inst: any, idx: number) => (
                  <Box key={inst.id || idx}>
                    {idx > 0 && <Divider sx={{ my: 1.5 }} />}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography variant="body2" fontWeight={600}>
                          Installment #{inst.installment_number}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Due: {formatDate(inst.due_date)}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="body2" fontWeight={600}>
                          {formatCurrency(inst.amount)}
                        </Typography>
                        <Chip
                          label={inst.status.charAt(0).toUpperCase() + inst.status.slice(1)}
                          color={getInstallmentStatusColor(inst.status)}
                          size="small"
                          sx={{ mt: 0.5 }}
                        />
                      </Box>
                    </Box>
                    {inst.paid_at && (
                      <Typography variant="caption" color="success.main" sx={{ mt: 0.5, display: 'block' }}>
                        Paid on {formatDate(inst.paid_at)}
                        {inst.paid_amount ? ` - ${formatCurrency(inst.paid_amount)}` : ''}
                      </Typography>
                    )}
                    {inst.late_fee > 0 && !inst.late_fee_waived && (
                      <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
                        Late fee: {formatCurrency(inst.late_fee)}
                      </Typography>
                    )}
                    {inst.late_fee_waived && (
                      <Typography variant="caption" color="info.main" sx={{ mt: 0.5, display: 'block' }}>
                        Late fee waived
                      </Typography>
                    )}
                    {inst.admin_notes && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                        Note: {inst.admin_notes}
                      </Typography>
                    )}
                  </Box>
                ))}
              </SectionCard>
            )}

            {/* Timeline */}
            {timelineEvents.length > 0 && (
              <SectionCard
                title="Payment Timeline"
                icon={<TimelineIcon sx={{ fontSize: 20, color: '#6A1B9A' }} />}
              >
                <Box sx={{ position: 'relative', pl: 3 }}>
                  {timelineEvents.map((event, idx) => {
                    const isLast = idx === timelineEvents.length - 1;
                    let dotColor = '#9E9E9E';
                    if (event.status === 'paid' || event.status === 'verified') dotColor = '#2E7D32';
                    else if (event.status === 'failed') dotColor = '#C62828';
                    else if (event.status === 'refunded') dotColor = '#757575';
                    else if (event.status === 'created') dotColor = '#1565C0';

                    return (
                      <Box key={idx} sx={{ position: 'relative', pb: isLast ? 0 : 2.5 }}>
                        {/* Dot */}
                        <Box
                          sx={{
                            position: 'absolute',
                            left: -24,
                            top: 4,
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            bgcolor: dotColor,
                            border: '2px solid white',
                            boxShadow: `0 0 0 2px ${dotColor}40`,
                          }}
                        />
                        {/* Line */}
                        {!isLast && (
                          <Box
                            sx={{
                              position: 'absolute',
                              left: -19,
                              top: 20,
                              bottom: 0,
                              width: 2,
                              bgcolor: 'grey.200',
                            }}
                          />
                        )}
                        {/* Content */}
                        <Typography variant="body2" fontWeight={600}>
                          {event.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {formatDateTime(event.date)}
                        </Typography>
                        {event.description && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                            {event.description}
                          </Typography>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              </SectionCard>
            )}
          </Box>
        </Grid>

        {/* Right column - Student info */}
        <Grid item xs={12} md={4}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Student Info */}
            <SectionCard
              title="Student Information"
              icon={<PersonIcon sx={{ fontSize: 20, color: '#2E7D32' }} />}
              headerAction={
                payment.user_id ? (
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => router.push(`/crm/${payment.user_id}`)}
                    sx={{ fontSize: '0.75rem', textTransform: 'none' }}
                  >
                    View in CRM
                  </Button>
                ) : undefined
              }
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Avatar
                  src={payment.student_avatar || undefined}
                  sx={{ width: 48, height: 48, bgcolor: '#1565C0' }}
                >
                  {payment.student_name.charAt(0).toUpperCase()}
                </Avatar>
                <Box>
                  <Typography variant="body1" fontWeight={600}>
                    {payment.student_name}
                  </Typography>
                  {payment.student_user_type && (
                    <Chip
                      label={payment.student_user_type.charAt(0).toUpperCase() + payment.student_user_type.slice(1)}
                      size="small"
                      variant="outlined"
                      sx={{ mt: 0.5 }}
                    />
                  )}
                </Box>
              </Box>

              {payment.student_email && (
                <>
                  <Divider sx={{ my: 0.5 }} />
                  <DetailRow label="Email" value={payment.student_email} copyable />
                </>
              )}
              {payment.student_phone && (
                <>
                  <Divider sx={{ my: 0.5 }} />
                  <DetailRow label="Phone" value={payment.student_phone} copyable />
                </>
              )}
              {(payment.city || payment.state) && (
                <>
                  <Divider sx={{ my: 0.5 }} />
                  <DetailRow
                    label="Location"
                    value={[payment.city, payment.state].filter(Boolean).join(', ')}
                  />
                </>
              )}
            </SectionCard>

            {/* Application Info */}
            {(payment.application_number || payment.interest_course || payment.course_name) && (
              <SectionCard
                title="Application Details"
                icon={<ReceiptIcon sx={{ fontSize: 20, color: '#E65100' }} />}
              >
                {payment.application_number && (
                  <DetailRow label="App #" value={payment.application_number} mono />
                )}
                {payment.interest_course && (
                  <>
                    {payment.application_number && <Divider sx={{ my: 0.5 }} />}
                    <DetailRow label="Course" value={getCourseLabel(payment.interest_course)} />
                  </>
                )}
                {payment.course_name && (
                  <>
                    <Divider sx={{ my: 0.5 }} />
                    <DetailRow label="Course Name" value={payment.course_name} />
                  </>
                )}
                {payment.fee_structure_name && (
                  <>
                    <Divider sx={{ my: 0.5 }} />
                    <DetailRow label="Fee Structure" value={payment.fee_structure_name} />
                  </>
                )}
                {payment.applicant_category && (
                  <>
                    <Divider sx={{ my: 0.5 }} />
                    <DetailRow
                      label="Category"
                      value={payment.applicant_category
                        .split('_')
                        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                        .join(' ')}
                    />
                  </>
                )}
                {payment.application_status && (
                  <>
                    <Divider sx={{ my: 0.5 }} />
                    <DetailRow
                      label="App Status"
                      value={
                        <Chip
                          label={payment.application_status
                            .split('_')
                            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                            .join(' ')}
                          size="small"
                          variant="outlined"
                        />
                      }
                    />
                  </>
                )}
                {payment.payment_scheme && (
                  <>
                    <Divider sx={{ my: 0.5 }} />
                    <DetailRow
                      label="Payment Scheme"
                      value={payment.payment_scheme === 'full' ? 'Full Payment' : 'Installment'}
                    />
                  </>
                )}
                {payment.assigned_fee !== null && (
                  <>
                    <Divider sx={{ my: 0.5 }} />
                    <DetailRow label="Assigned Fee" value={formatCurrency(payment.assigned_fee)} />
                  </>
                )}
                {payment.final_fee !== null && (
                  <>
                    <Divider sx={{ my: 0.5 }} />
                    <DetailRow label="Final Fee" value={formatCurrency(payment.final_fee)} />
                  </>
                )}
              </SectionCard>
            )}

            {/* Metadata */}
            {payment.metadata && Object.keys(payment.metadata).length > 0 && (
              <SectionCard
                title="Metadata"
                icon={<ReceiptIcon sx={{ fontSize: 20, color: '#757575' }} />}
              >
                <Box
                  component="pre"
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    bgcolor: 'grey.50',
                    p: 1.5,
                    borderRadius: 1,
                    overflow: 'auto',
                    maxHeight: 200,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    m: 0,
                  }}
                >
                  {JSON.stringify(payment.metadata, null, 2)}
                </Box>
              </SectionCard>
            )}
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
