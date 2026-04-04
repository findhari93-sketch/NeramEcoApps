// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Box,
  Container,
  Paper,
  Typography,
  Button,
  Alert,
  TextField,
  Stack,
  Radio,
  RadioGroup,
  FormControl,
  FormControlLabel,
  FormLabel,
  Divider,
  Chip,
  CircularProgress,
} from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SchoolIcon from '@mui/icons-material/School';
import PaymentIcon from '@mui/icons-material/Payment';
import PersonIcon from '@mui/icons-material/Person';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface PaymentDetails {
  leadProfileId: string;
  studentFirstName: string;
  courseName: string;
  baseFee: number;
  finalFee: number;
  scholarshipDiscount: number;
  fullPaymentDiscount: number;
  fullPaymentAmount: number;
  installment1Amount: number;
  installment2Amount: number;
  installment2DueDays: number;
  allowedPaymentModes: 'full_only' | 'full_and_installment';
  paymentDeadline: string | null;
  couponCode: string | null;
  totalPaid: number;
  remainingAmount: number;
  status: string;
}

interface ReceiptData {
  receiptNumber: string | null;
  amount: number;
  razorpayPaymentId: string;
  paidAt: string;
  courseName: string;
  paymentScheme: string;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

export default function PaymentPage() {
  const searchParams = useSearchParams();
  const applicationNumber = searchParams.get('app');

  // Data states
  const [details, setDetails] = useState<PaymentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [errorType, setErrorType] = useState('');

  // Payment selection
  const [selectedScheme, setSelectedScheme] = useState<'full' | 'installment'>('full');

  // Coupon
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  // Payer info
  const [payerName, setPayerName] = useState('');
  const [payerRelationship, setPayerRelationship] = useState('self');

  // Payment flow
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  // Restore receipt from sessionStorage on mount (survives back button / refresh)
  useEffect(() => {
    if (!applicationNumber) return;
    try {
      const saved = sessionStorage.getItem(`neram_receipt_${applicationNumber}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        setReceiptData(parsed.receipt);
        setPayerRelationship(parsed.payerRelationship || 'self');
        setPaymentSuccess(true);
      }
    } catch { /* ignore */ }
  }, [applicationNumber]);

  // ── Fetch payment details ──

  const fetchDetails = useCallback(async () => {
    if (!applicationNumber) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    setErrorType('');
    try {
      const res = await fetch(`/api/payment/details?app=${encodeURIComponent(applicationNumber)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Failed to load payment details.');
        setErrorType(data.error || 'unknown');
        return;
      }
      setDetails(data);

      // Pre-fill admin-assigned coupon
      if (data.couponCode) {
        setCouponCode(data.couponCode);
      }
    } catch {
      setError('Unable to connect. Please check your internet and try again.');
      setErrorType('network');
    } finally {
      setLoading(false);
    }
  }, [applicationNumber]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  // ── Load Razorpay script ──

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (document.querySelector('script[src*="razorpay"]')) return;
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
  }, []);

  // ── Coupon ──

  const handleApplyCoupon = async () => {
    setCouponError('');
    if (!couponCode || !details) return;
    setCouponLoading(true);
    try {
      const response = await fetch('/api/coupon/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: couponCode,
          leadProfileId: details.leadProfileId,
          amount: details.finalFee,
        }),
      });
      const result = await response.json();
      if (result.valid) {
        setCouponApplied(true);
        setCouponDiscount(result.discountAmount || 0);
      } else {
        setCouponError(result.error || 'Invalid or expired coupon code');
      }
    } catch {
      setCouponError('Failed to validate coupon. Please try again.');
    } finally {
      setCouponLoading(false);
    }
  };

  // ── Calculate payable amount ──

  const getPayableAmount = (): number => {
    if (!details) return 0;
    let amount: number;
    if (selectedScheme === 'full') {
      amount = details.fullPaymentAmount;
    } else {
      amount = details.installment1Amount;
    }
    if (couponApplied && couponDiscount > 0) {
      amount = Math.max(1, amount - couponDiscount);
    }
    return amount;
  };

  // ── Razorpay payment ──

  const handlePayNow = async () => {
    if (!details || !payerName.trim()) return;
    setIsProcessing(true);
    setError('');

    try {
      const orderResponse = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadProfileId: details.leadProfileId,
          paymentScheme: selectedScheme,
          couponCode: couponApplied ? couponCode : null,
          couponDiscount: couponApplied ? couponDiscount : 0,
          youtubeDiscount: 0,
          publicPayment: true,
          payerName: payerName.trim(),
          payerRelationship,
        }),
      });

      if (!orderResponse.ok) {
        const errData = await orderResponse.json();
        throw new Error(errData.message || 'Failed to create payment order.');
      }

      const { order, paymentId, keyId } = await orderResponse.json();

      const options = {
        key: keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'Neram Classes',
        description: details.courseName,
        order_id: order.id,
        prefill: {
          name: payerName.trim(),
        },
        notes: {
          payer_relationship: payerRelationship,
          application_number: applicationNumber,
        },
        theme: { color: '#1565C0' },
        handler: async (razorpayResponse: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verifyResponse = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...razorpayResponse,
                paymentId,
                publicPayment: true,
                payerName: payerName.trim(),
                payerRelationship,
              }),
            });

            if (verifyResponse.ok) {
              const verifyData = await verifyResponse.json();
              setReceiptData(verifyData.receipt || null);
              setPaymentSuccess(true);
              // Persist receipt so back button / refresh shows success screen
              try {
                sessionStorage.setItem(`neram_receipt_${applicationNumber}`, JSON.stringify({
                  receipt: verifyData.receipt,
                  payerRelationship,
                }));
              } catch { /* ignore */ }
            } else {
              setError('Payment verification failed. Please contact support with your payment reference.');
              setIsProcessing(false);
            }
          } catch {
            setError('Payment verification failed. Please contact support.');
            setIsProcessing(false);
          }
        },
        modal: {
          ondismiss: () => {
            setIsProcessing(false);
          },
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'Failed to initiate payment. Please try again.');
      setIsProcessing(false);
    }
  };

  const payableAmount = getPayableAmount();

  // ── No application number ──

  if (!applicationNumber) {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 5 } }}>
        <Paper sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
          <PaymentIcon sx={{ fontSize: 56, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h5" fontWeight={600} gutterBottom>
            Payment Link Required
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            This page requires a valid payment link. Please use the payment link shared by Neram Classes.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            If you need help, contact us at <strong>info@neramclasses.com</strong>
          </Typography>
        </Paper>
      </Container>
    );
  }

  // ── Loading ──

  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 5 } }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 8 }}>
          <CircularProgress size={48} thickness={3} />
          <Typography color="text.secondary">Loading payment details...</Typography>
        </Box>
      </Container>
    );
  }

  // ── Error states ──

  if (error && !details) {
    const isAlreadyPaid = errorType === 'already_paid';
    const isNotApproved = errorType === 'not_approved';

    return (
      <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 5 } }}>
        <Paper sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
          {isAlreadyPaid ? (
            <>
              <CheckCircleIcon sx={{ fontSize: 56, color: 'success.main', mb: 2 }} />
              <Typography variant="h5" fontWeight={600} gutterBottom>
                Payment Already Completed
              </Typography>
            </>
          ) : (
            <>
              <PaymentIcon sx={{ fontSize: 56, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h5" fontWeight={600} gutterBottom>
                {isNotApproved ? 'Application Under Review' : 'Unable to Process'}
              </Typography>
            </>
          )}
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {error}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Application: <strong>{applicationNumber}</strong>
          </Typography>
        </Paper>
      </Container>
    );
  }

  // ── Payment success / receipt ──

  if (paymentSuccess) {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 5 } }}>
        <Paper sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
          <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Payment Successful!
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Thank you for your payment. A confirmation has been sent.
          </Typography>

          {receiptData && (
            <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, mb: 3, textAlign: 'left' }}>
              <Stack spacing={1.5}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <ReceiptLongIcon fontSize="small" color="action" />
                  <Typography variant="subtitle2" color="text.secondary">
                    Receipt Details
                  </Typography>
                </Stack>
                <Divider />
                {receiptData.receiptNumber && (
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Receipt No.</Typography>
                    <Typography variant="body2" fontWeight={600}>{receiptData.receiptNumber}</Typography>
                  </Stack>
                )}
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Course</Typography>
                  <Typography variant="body2" fontWeight={600}>{receiptData.courseName}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Amount</Typography>
                  <Typography variant="body2" fontWeight={600}>{formatCurrency(receiptData.amount)}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Payment ID</Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ wordBreak: 'break-all' }}>
                    {receiptData.razorpayPaymentId}
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Date</Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {new Date(receiptData.paidAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </Typography>
                </Stack>
              </Stack>
            </Paper>
          )}

          {payerRelationship === 'self' ? (
            <Button
              variant="contained"
              size="large"
              href={`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011'}/welcome`}
              sx={{ minHeight: 48, px: 4 }}
            >
              Start Onboarding
            </Button>
          ) : (
            <Alert severity="info" sx={{ textAlign: 'left' }}>
              Please share this confirmation with the student so they can complete their onboarding at{' '}
              <strong>{(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011').replace(/^https?:\/\//, '')}</strong>.
            </Alert>
          )}
        </Paper>
      </Container>
    );
  }

  // ── Main payment form ──

  if (!details) return null;

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 5 } }}>
      <Stack spacing={3}>
        {/* Header */}
        <Box sx={{ textAlign: 'center' }}>
          <SchoolIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
          <Typography variant="h5" fontWeight={700}>
            Complete Your Payment
          </Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
            Application: {applicationNumber}
          </Typography>
        </Box>

        {/* Inline error */}
        {error && (
          <Alert severity="error" onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {/* Payment deadline warning */}
        {details.paymentDeadline && (
          <Alert severity="warning">
            Payment deadline:{' '}
            <strong>
              {new Date(details.paymentDeadline).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </strong>
            . Please complete your payment before the deadline to secure your seat.
          </Alert>
        )}

        {/* Fee Summary */}
        <Paper sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Fee Summary
          </Typography>
          <Stack spacing={1.5}>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">Student</Typography>
              <Typography variant="body2" fontWeight={600}>{details.studentFirstName}</Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">Course</Typography>
              <Typography variant="body2" fontWeight={600}>{details.courseName}</Typography>
            </Stack>
            <Divider />
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">Course Fee</Typography>
              <Typography variant="body2">{formatCurrency(details.baseFee)}</Typography>
            </Stack>
            {details.scholarshipDiscount > 0 && (
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="success.main">Scholarship Discount</Typography>
                <Typography variant="body2" color="success.main">- {formatCurrency(details.scholarshipDiscount)}</Typography>
              </Stack>
            )}
            <Divider />
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" fontWeight={600}>Total Fee</Typography>
              <Typography variant="body2" fontWeight={600}>{formatCurrency(details.finalFee)}</Typography>
            </Stack>
            {details.totalPaid > 0 && (
              <>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="success.main">Already Paid</Typography>
                  <Typography variant="body2" color="success.main">- {formatCurrency(details.totalPaid)}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" fontWeight={600}>Remaining</Typography>
                  <Typography variant="body2" fontWeight={700} color="primary.main">
                    {formatCurrency(details.remainingAmount)}
                  </Typography>
                </Stack>
              </>
            )}
          </Stack>
        </Paper>

        {/* Payment Scheme Selection */}
        {details.allowedPaymentModes === 'full_and_installment' && (
          <Paper sx={{ p: { xs: 2.5, sm: 3 } }}>
            <FormControl component="fieldset" sx={{ width: '100%' }}>
              <FormLabel component="legend" sx={{ mb: 1, fontWeight: 600, fontSize: '0.95rem' }}>
                Payment Option
              </FormLabel>
              <RadioGroup
                value={selectedScheme}
                onChange={(e) => setSelectedScheme(e.target.value as 'full' | 'installment')}
              >
                <Paper
                  variant="outlined"
                  sx={{
                    p: { xs: 1.5, sm: 2 },
                    mb: 1.5,
                    borderColor: selectedScheme === 'full' ? 'primary.main' : 'divider',
                    borderWidth: selectedScheme === 'full' ? 2 : 1,
                    cursor: 'pointer',
                  }}
                  onClick={() => setSelectedScheme('full')}
                >
                  <FormControlLabel
                    value="full"
                    control={<Radio sx={{ '& .MuiSvgIcon-root': { fontSize: 24 } }} />}
                    label={
                      <Box>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Typography fontWeight={600}>
                            Pay in Full &mdash; {formatCurrency(details.fullPaymentAmount)}
                          </Typography>
                          {details.fullPaymentDiscount > 0 && (
                            <Chip
                              label={`Save ${formatCurrency(details.fullPaymentDiscount)}`}
                              size="small"
                              color="success"
                              variant="outlined"
                            />
                          )}
                        </Stack>
                        {details.fullPaymentDiscount > 0 && (
                          <Typography variant="caption" color="text.secondary">
                            One-time payment with {formatCurrency(details.fullPaymentDiscount)} discount
                          </Typography>
                        )}
                      </Box>
                    }
                    sx={{ m: 0, width: '100%', '& .MuiFormControlLabel-label': { flex: 1 } }}
                  />
                </Paper>

                <Paper
                  variant="outlined"
                  sx={{
                    p: { xs: 1.5, sm: 2 },
                    borderColor: selectedScheme === 'installment' ? 'primary.main' : 'divider',
                    borderWidth: selectedScheme === 'installment' ? 2 : 1,
                    cursor: 'pointer',
                  }}
                  onClick={() => setSelectedScheme('installment')}
                >
                  <FormControlLabel
                    value="installment"
                    control={<Radio sx={{ '& .MuiSvgIcon-root': { fontSize: 24 } }} />}
                    label={
                      <Box>
                        <Typography fontWeight={600}>
                          Pay in Installments
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          1st: {formatCurrency(details.installment1Amount)} now &bull; 2nd: {formatCurrency(details.installment2Amount)} within {details.installment2DueDays} days
                        </Typography>
                      </Box>
                    }
                    sx={{ m: 0, width: '100%', '& .MuiFormControlLabel-label': { flex: 1 } }}
                  />
                </Paper>
              </RadioGroup>
            </FormControl>
          </Paper>
        )}

        {/* Coupon */}
        {details.couponCode && !couponApplied && (
          <Paper sx={{ p: { xs: 2.5, sm: 3 } }}>
            <Typography variant="subtitle2" gutterBottom>
              Coupon Code
            </Typography>
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <TextField
                size="small"
                value={couponCode}
                onChange={(e) => {
                  setCouponCode(e.target.value.toUpperCase());
                  setCouponError('');
                }}
                placeholder="Enter coupon code"
                error={!!couponError}
                helperText={couponError}
                sx={{ flex: 1 }}
                inputProps={{ style: { textTransform: 'uppercase' } }}
              />
              <Button
                variant="outlined"
                onClick={handleApplyCoupon}
                disabled={!couponCode || couponLoading}
                sx={{ minHeight: 40, minWidth: 80 }}
              >
                {couponLoading ? <CircularProgress size={20} /> : 'Apply'}
              </Button>
            </Stack>
          </Paper>
        )}

        {couponApplied && couponDiscount > 0 && (
          <Alert severity="success">
            Coupon applied! You save {formatCurrency(couponDiscount)}.
          </Alert>
        )}

        {/* Payer Information */}
        <Paper sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <PersonIcon fontSize="small" color="action" />
            <Typography variant="subtitle1" fontWeight={600}>
              Payer Information
            </Typography>
          </Stack>
          <Stack spacing={2.5}>
            <TextField
              label="Payer Name"
              placeholder="Enter the name of the person making the payment"
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
              required
              fullWidth
              inputProps={{ style: { minHeight: 24 } }}
              sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
            />
            <FormControl component="fieldset">
              <FormLabel component="legend" sx={{ fontSize: '0.875rem', mb: 0.5 }}>
                Relationship to Student
              </FormLabel>
              <RadioGroup
                row
                value={payerRelationship}
                onChange={(e) => setPayerRelationship(e.target.value)}
                sx={{ gap: { xs: 0.5, sm: 1 } }}
              >
                {['Self', 'Parent', 'Guardian', 'Sibling', 'Other'].map((rel) => (
                  <FormControlLabel
                    key={rel}
                    value={rel.toLowerCase()}
                    control={<Radio size="small" />}
                    label={rel}
                    sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.875rem' } }}
                  />
                ))}
              </RadioGroup>
            </FormControl>
          </Stack>
        </Paper>

        {/* Pay Now */}
        <Paper sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">Amount to Pay</Typography>
            <Typography variant="h5" fontWeight={700} color="primary.main">
              {formatCurrency(payableAmount)}
            </Typography>
          </Stack>
          <Button
            variant="contained"
            size="large"
            fullWidth
            disabled={!payerName.trim() || isProcessing}
            onClick={handlePayNow}
            startIcon={
              isProcessing
                ? <CircularProgress size={20} color="inherit" />
                : <PaymentIcon />
            }
            sx={{ minHeight: 52, fontSize: '1rem', fontWeight: 600 }}
          >
            {isProcessing ? 'Processing...' : `Pay ${formatCurrency(payableAmount)}`}
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 1.5 }}>
            Secured by Razorpay. UPI, Cards, Net Banking accepted.
          </Typography>
        </Paper>
      </Stack>
    </Container>
  );
}
