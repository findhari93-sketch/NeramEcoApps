'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import {
  Box,
  Typography,
  Paper,
  Button,
  Grid,
  Alert,
  Chip,
  Divider,
  FormControlLabel,
  Radio,
  RadioGroup,
  TextField,
  Stack,
  CircularProgress,
  Container,
} from '@neram/ui';
import { DocumentUpload } from '@neram/ui';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SavingsIcon from '@mui/icons-material/Savings';
import { useFirebaseAuth } from '@neram/auth';

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface PaymentDetailsResponse {
  leadProfileId: string;
  courseName: string;
  status: string;
  baseFee: number;
  finalFee: number;
  fullPaymentDiscount: number;
  fullPaymentAmount: number;
  installment1Amount: number;
  installment2Amount: number;
  paymentRecommendation: string;
  paymentScheme: string;
  paymentDeadline: string | null;
  totalPaid: number;
  remainingAmount: number;
  payments: any[];
  installments: any[];
  scholarshipDiscount: number;
  couponCode: string | null;
}

export default function PaymentPage({ params }: { params: { leadId: string } }) {
  const router = useRouter();
  const { user } = useFirebaseAuth();
  const [details, setDetails] = useState<PaymentDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Payment scheme: full or installment
  const [selectedScheme, setSelectedScheme] = useState<'full' | 'installment'>('full');
  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'direct'>('razorpay');
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [directPayDetails, setDirectPayDetails] = useState({
    utrNumber: '',
    payerName: '',
    screenshotUrl: '',
  });
  const [uploading, setUploading] = useState(false);

  const fetchPaymentDetails = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/payment/details/${params.leadId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load payment details');
      }
      const data: PaymentDetailsResponse = await res.json();
      setDetails(data);
      setSelectedScheme(data.paymentScheme === 'installment' ? 'installment' : 'full');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [params.leadId]);

  useEffect(() => {
    fetchPaymentDetails();
  }, [fetchPaymentDetails]);

  const getPayableAmount = () => {
    if (!details) return 0;
    if (selectedScheme === 'full') {
      return details.fullPaymentAmount;
    }
    return details.installment1Amount;
  };

  const handleApplyCoupon = async () => {
    setCouponError('');
    try {
      const response = await fetch('/api/coupon/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode, leadProfileId: params.leadId }),
      });

      if (response.ok) {
        setCouponApplied(true);
        fetchPaymentDetails();
      } else {
        setCouponError('Invalid or expired coupon code');
      }
    } catch {
      setCouponError('Failed to apply coupon');
    }
  };

  const handleRazorpayPayment = async () => {
    if (!details || !user) return;
    setIsProcessing(true);

    try {
      const response = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadProfileId: params.leadId,
          paymentScheme: selectedScheme,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Failed to create order');
      }

      const { order, paymentId, keyId } = await response.json();

      const options = {
        key: keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'Neram Classes',
        description: details.courseName,
        order_id: order.id,
        prefill: {
          name: user.name,
          email: user.email,
          contact: user.phone,
        },
        theme: { color: '#1565C0' },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          const verifyResponse = await fetch('/api/payment/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...response, paymentId }),
          });

          if (verifyResponse.ok) {
            setPaymentSuccess(true);
          } else {
            alert('Payment verification failed. Please contact support.');
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
    } catch (error: any) {
      console.error('Payment error:', error);
      alert(error.message || 'Failed to initiate payment. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDirectPayment = async () => {
    if (!directPayDetails.screenshotUrl) {
      alert('Please upload payment screenshot');
      return;
    }
    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append('leadProfileId', params.leadId);
      formData.append('amount', String(getPayableAmount()));
      formData.append('utrNumber', directPayDetails.utrNumber);
      formData.append('payerName', directPayDetails.payerName);
      formData.append('paymentMethod', 'upi');
      formData.append('screenshotUrl', directPayDetails.screenshotUrl);

      const response = await fetch('/api/payment/screenshot', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setPaymentSuccess(true);
      } else {
        throw new Error('Failed to submit payment');
      }
    } catch (error) {
      console.error('Direct payment error:', error);
      alert('Failed to submit payment. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleScreenshotUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'payment_screenshot');

      const response = await fetch('/api/upload/document', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      const { url } = await response.json();
      setDirectPayDetails((prev) => ({ ...prev, screenshotUrl: url }));
      return url;
    } finally {
      setUploading(false);
    }
  };

  // Success screen
  if (paymentSuccess) {
    return (
      <Container maxWidth="sm">
        <Paper sx={{ p: 4, textAlign: 'center', mt: 4 }}>
          <Box
            sx={{
              width: 80, height: 80, borderRadius: '50%', bgcolor: 'success.light',
              display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 3,
            }}
          >
            <CheckCircleIcon sx={{ fontSize: 48, color: 'success.main' }} />
          </Box>
          <Typography variant="h5" gutterBottom fontWeight={600}>
            {paymentMethod === 'razorpay' ? 'Payment Successful!' : 'Payment Submitted!'}
          </Typography>
          <Typography color="text.secondary" paragraph>
            {paymentMethod === 'razorpay'
              ? 'Your enrollment is confirmed. Welcome to Neram Classes!'
              : 'Our team will verify your payment within 24 hours. You will receive a confirmation email.'}
          </Typography>
          <Button variant="contained" href="/dashboard" sx={{ mt: 2 }}>
            Go to Dashboard
          </Button>
        </Paper>
      </Container>
    );
  }

  // Loading
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  // Error
  if (error || !details) {
    return (
      <Container maxWidth="sm">
        <Alert severity="error" sx={{ mt: 4 }}>{error || 'Failed to load payment details'}</Alert>
      </Container>
    );
  }

  // Already fully paid
  if (details.remainingAmount <= 0) {
    return (
      <Container maxWidth="sm">
        <Paper sx={{ p: 4, textAlign: 'center', mt: 4 }}>
          <CheckCircleIcon sx={{ fontSize: 48, color: 'success.main', mb: 2 }} />
          <Typography variant="h5" gutterBottom fontWeight={600}>Payment Complete</Typography>
          <Typography color="text.secondary">Your fees have been fully paid. Welcome to Neram Classes!</Typography>
          <Button variant="contained" href="/dashboard" sx={{ mt: 3 }}>Go to Dashboard</Button>
        </Paper>
      </Container>
    );
  }

  const payableAmount = getPayableAmount();

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" />

      <Box>
        <Typography variant="h4" gutterBottom fontWeight={600}>
          Complete Your Payment
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Secure payment for {details.courseName}
        </Typography>

        <Grid container spacing={3}>
          {/* Left: Fee Summary + Scheme Selector */}
          <Grid item xs={12} md={5}>
            {/* Payment Scheme Selector */}
            <Paper sx={{ p: 2.5, mb: 2.5 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2, fontSize: 14 }}>
                Choose Payment Plan
              </Typography>

              {/* Full Payment Card */}
              <Paper
                variant="outlined"
                onClick={() => setSelectedScheme('full')}
                sx={{
                  p: 2, mb: 1.5, cursor: 'pointer', borderWidth: 2, borderRadius: 2,
                  borderColor: selectedScheme === 'full' ? 'success.main' : 'grey.200',
                  bgcolor: selectedScheme === 'full' ? '#E8F5E9' : 'transparent',
                  transition: 'all 0.2s',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SavingsIcon sx={{ color: 'success.main', fontSize: 20 }} />
                  <Typography fontWeight={700} sx={{ fontSize: 14 }}>Full Payment</Typography>
                  {details.fullPaymentDiscount > 0 && (
                    <Chip label={`Save Rs. ${details.fullPaymentDiscount.toLocaleString('en-IN')}`} color="success" size="small" sx={{ ml: 'auto', fontWeight: 700, fontSize: 11 }} />
                  )}
                </Box>
                <Typography variant="h5" fontWeight={800} color="success.main" sx={{ mt: 1 }}>
                  Rs. {details.fullPaymentAmount.toLocaleString('en-IN')}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  One-time payment
                </Typography>
              </Paper>

              {/* Installment Card */}
              <Paper
                variant="outlined"
                onClick={() => setSelectedScheme('installment')}
                sx={{
                  p: 2, cursor: 'pointer', borderWidth: 2, borderRadius: 2,
                  borderColor: selectedScheme === 'installment' ? 'primary.main' : 'grey.200',
                  bgcolor: selectedScheme === 'installment' ? '#E3F2FD' : 'transparent',
                  transition: 'all 0.2s',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AccountBalanceIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                  <Typography fontWeight={700} sx={{ fontSize: 14 }}>2 Installments</Typography>
                </Box>
                <Typography variant="h5" fontWeight={800} color="primary.main" sx={{ mt: 1 }}>
                  Rs. {details.installment1Amount.toLocaleString('en-IN')}
                  <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.5, fontWeight: 400 }}>now</Typography>
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  + Rs. {details.installment2Amount.toLocaleString('en-IN')} in 30 days
                </Typography>
              </Paper>

              {/* Nudge banner */}
              {selectedScheme === 'installment' && details.fullPaymentDiscount > 0 && (
                <Alert severity="success" sx={{ mt: 1.5, borderRadius: 1.5 }}>
                  <Typography variant="body2" sx={{ fontSize: 12.5 }}>
                    Switch to full payment and <strong>save Rs. {details.fullPaymentDiscount.toLocaleString('en-IN')}!</strong>
                  </Typography>
                </Alert>
              )}
            </Paper>

            {/* Fee Summary */}
            <Paper sx={{ p: 2.5, position: 'sticky', top: 24 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, fontSize: 14 }}>
                Fee Summary
              </Typography>
              <Divider sx={{ mb: 1.5 }} />

              <Stack spacing={1}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Course Fee</Typography>
                  <Typography variant="body2">Rs. {details.baseFee.toLocaleString('en-IN')}</Typography>
                </Box>

                {details.scholarshipDiscount > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', color: 'success.main' }}>
                    <Typography variant="body2">Scholarship Discount</Typography>
                    <Typography variant="body2">- Rs. {details.scholarshipDiscount.toLocaleString('en-IN')}</Typography>
                  </Box>
                )}

                {selectedScheme === 'full' && details.fullPaymentDiscount > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', color: 'success.main' }}>
                    <Typography variant="body2">Full Payment Discount</Typography>
                    <Typography variant="body2" fontWeight={600}>- Rs. {details.fullPaymentDiscount.toLocaleString('en-IN')}</Typography>
                  </Box>
                )}

                <Divider />

                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    {selectedScheme === 'installment' ? 'Pay Now (1st)' : 'Amount to Pay'}
                  </Typography>
                  <Typography variant="subtitle1" color="primary" fontWeight={800}>
                    Rs. {payableAmount.toLocaleString('en-IN')}
                  </Typography>
                </Box>

                {selectedScheme === 'installment' && (
                  <Alert severity="info" sx={{ borderRadius: 1.5 }}>
                    <Typography variant="body2" sx={{ fontSize: 12 }}>
                      2nd installment of <strong>Rs. {details.installment2Amount.toLocaleString('en-IN')}</strong> due in 30 days
                    </Typography>
                  </Alert>
                )}
              </Stack>

              {/* Coupon Code */}
              <Box sx={{ mt: 2.5 }}>
                <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>
                  Have a coupon code?
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    size="small"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    placeholder="Enter code"
                    disabled={couponApplied}
                    error={!!couponError}
                    helperText={couponError}
                    sx={{ flex: 1 }}
                  />
                  <Button
                    variant="outlined"
                    onClick={handleApplyCoupon}
                    disabled={!couponCode || couponApplied}
                    startIcon={<LocalOfferIcon />}
                    size="small"
                  >
                    Apply
                  </Button>
                </Box>
                {couponApplied && (
                  <Chip label="Coupon Applied!" color="success" size="small" sx={{ mt: 1 }} />
                )}
              </Box>

              {details.paymentDeadline && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2 }}>
                  Payment deadline: {new Date(details.paymentDeadline).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </Typography>
              )}
            </Paper>
          </Grid>

          {/* Right: Payment Methods */}
          <Grid item xs={12} md={7}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Choose Payment Method
              </Typography>
              <Divider sx={{ mb: 3 }} />

              <RadioGroup
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as 'razorpay' | 'direct')}
              >
                {/* Razorpay */}
                <Paper
                  sx={{
                    p: 2, mb: 2, border: '2px solid', borderRadius: 2,
                    borderColor: paymentMethod === 'razorpay' ? 'primary.main' : 'grey.200',
                    cursor: 'pointer',
                  }}
                  onClick={() => setPaymentMethod('razorpay')}
                >
                  <FormControlLabel
                    value="razorpay"
                    control={<Radio />}
                    label={
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <CreditCardIcon color="primary" />
                          <Typography fontWeight={600}>Pay Online</Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          UPI, Credit/Debit Card, Net Banking
                        </Typography>
                      </Box>
                    }
                  />
                </Paper>

                {/* Direct Payment */}
                <Paper
                  sx={{
                    p: 2, border: '2px solid', borderRadius: 2,
                    borderColor: paymentMethod === 'direct' ? 'primary.main' : 'grey.200',
                    cursor: 'pointer',
                  }}
                  onClick={() => setPaymentMethod('direct')}
                >
                  <FormControlLabel
                    value="direct"
                    control={<Radio />}
                    label={
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <AccountBalanceIcon color="success" />
                          <Typography fontWeight={600}>Direct UPI/Bank Transfer</Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          Pay directly to our UPI/Bank account & upload screenshot
                        </Typography>
                      </Box>
                    }
                  />
                </Paper>
              </RadioGroup>

              {/* Direct Payment Form */}
              {paymentMethod === 'direct' && (
                <Box sx={{ mt: 3 }}>
                  <Alert severity="info" sx={{ mb: 3 }}>
                    <Typography variant="body2" fontWeight={600}>
                      UPI ID: neramclasses@upi
                    </Typography>
                    <Typography variant="body2">
                      Bank: HDFC Bank | A/C: 50200012345678 | IFSC: HDFC0001234
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      Please transfer <strong>Rs. {payableAmount.toLocaleString('en-IN')}</strong> and upload the screenshot below.
                    </Typography>
                  </Alert>

                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="UTR/Transaction Number"
                        value={directPayDetails.utrNumber}
                        onChange={(e) => setDirectPayDetails((prev) => ({ ...prev, utrNumber: e.target.value }))}
                        placeholder="12 digit UTR number"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Payer Name (as per bank)"
                        value={directPayDetails.payerName}
                        onChange={(e) => setDirectPayDetails((prev) => ({ ...prev, payerName: e.target.value }))}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <DocumentUpload
                        label="Payment Screenshot"
                        accept="image/*"
                        maxSize={10}
                        value={directPayDetails.screenshotUrl}
                        onUpload={handleScreenshotUpload}
                        onChange={(url) => setDirectPayDetails((prev) => ({ ...prev, screenshotUrl: url || '' }))}
                        helperText="Upload clear screenshot showing transaction details"
                        required
                      />
                    </Grid>
                  </Grid>
                </Box>
              )}

              {/* Pay Button */}
              <Box sx={{ mt: 4 }}>
                <Button
                  fullWidth
                  variant="contained"
                  size="large"
                  onClick={paymentMethod === 'razorpay' ? handleRazorpayPayment : handleDirectPayment}
                  disabled={isProcessing || (paymentMethod === 'direct' && !directPayDetails.screenshotUrl)}
                  startIcon={isProcessing ? <CircularProgress size={20} color="inherit" /> : null}
                  sx={{ py: 1.5, fontWeight: 700, fontSize: 16, borderRadius: 2 }}
                >
                  {isProcessing
                    ? 'Processing...'
                    : paymentMethod === 'razorpay'
                    ? `Pay Rs. ${payableAmount.toLocaleString('en-IN')}`
                    : 'Submit Payment Proof'}
                </Button>

                <Typography variant="caption" color="text.secondary" textAlign="center" display="block" sx={{ mt: 2 }}>
                  By proceeding, you agree to our Terms & Conditions and Refund Policy.
                </Typography>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </>
  );
}
