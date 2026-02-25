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
import YouTubeIcon from '@mui/icons-material/YouTube';
import StarIcon from '@mui/icons-material/Star';
import ScheduleIcon from '@mui/icons-material/Schedule';
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
  installment2DueDays: number;
  allowedPaymentModes: 'full_only' | 'full_and_installment';
  paymentRecommendation: string;
  paymentScheme: string;
  paymentDeadline: string | null;
  totalPaid: number;
  remainingAmount: number;
  payments: any[];
  installments: any[];
  scholarshipDiscount: number;
  couponCode: string | null;
  adminCouponCode: string | null;
  hasCoupon: boolean;
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

  // Coupon state
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponError, setCouponError] = useState('');

  // YouTube coupon state
  const [youtubeCouponApplied, setYoutubeCouponApplied] = useState(false);
  const [youtubeDiscount, setYoutubeDiscount] = useState(0);
  const [youtubeLoading, setYoutubeLoading] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [receiptData, setReceiptData] = useState<{
    receiptNumber: string | null;
    amount: number;
    razorpayPaymentId: string;
    paidAt: string;
    courseName: string;
    paymentScheme: string;
  } | null>(null);
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
      setSelectedScheme(data.paymentRecommendation === 'installment' ? 'installment' : 'full');

      // Pre-fill admin coupon if exists
      if (data.adminCouponCode && !couponApplied) {
        setCouponCode(data.adminCouponCode);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [params.leadId]);

  useEffect(() => {
    fetchPaymentDetails();
  }, [fetchPaymentDetails]);

  const totalDiscounts = couponDiscount + youtubeDiscount;

  const getPayableAmount = () => {
    if (!details) return 0;
    let amount: number;
    if (selectedScheme === 'full') {
      amount = details.fullPaymentAmount;
    } else {
      amount = details.installment1Amount;
    }
    // Apply stackable coupon discounts
    amount = Math.max(0, amount - totalDiscounts);
    return amount;
  };

  const handleApplyCoupon = async () => {
    setCouponError('');
    if (!couponCode || !details) return;

    try {
      const response = await fetch('/api/coupon/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: couponCode,
          leadProfileId: params.leadId,
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
      setCouponError('Failed to apply coupon');
    }
  };

  const handleYouTubeSubscribe = async () => {
    // Open YouTube channel in new tab
    window.open('https://www.youtube.com/@NeramClasses', '_blank');
    setYoutubeLoading(true);

    // Small delay to let user subscribe
    setTimeout(async () => {
      try {
        const res = await fetch('/api/verify/youtube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelId: process.env.NEXT_PUBLIC_YOUTUBE_CHANNEL_ID || 'NeramClasses',
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setYoutubeCouponApplied(true);
          setYoutubeDiscount(50);
          // If coupon code returned, we could auto-apply but the discount is already tracked
          if (data.coupon?.code) {
            // YouTube coupon is stackable - just add the discount
          }
        }
      } catch (err) {
        console.error('YouTube verification error:', err);
      } finally {
        setYoutubeLoading(false);
      }
    }, 3000);
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
            const verifyData = await verifyResponse.json();
            setReceiptData(verifyData.receipt || null);
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

  // Success screen - Order confirmation style
  if (paymentSuccess) {
    const paidDate = receiptData?.paidAt
      ? new Date(receiptData.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
      : new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    return (
      <Container maxWidth="sm">
        <Paper sx={{ p: { xs: 3, sm: 4 }, mt: 4 }}>
          {/* Success Header */}
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Box
              sx={{
                width: 80, height: 80, borderRadius: '50%', bgcolor: '#E8F5E9',
                display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2,
              }}
            >
              <CheckCircleIcon sx={{ fontSize: 48, color: 'success.main' }} />
            </Box>
            <Typography variant="h5" gutterBottom fontWeight={700}>
              {paymentMethod === 'razorpay' ? 'Payment Confirmed!' : 'Payment Submitted!'}
            </Typography>
            <Typography color="text.secondary">
              {paymentMethod === 'razorpay'
                ? 'Welcome to Neram Classes'
                : 'Our team will verify your payment within 24 hours'}
            </Typography>
          </Box>

          {/* Receipt Number */}
          {receiptData?.receiptNumber && (
            <Paper
              elevation={0}
              sx={{
                textAlign: 'center', py: 1.5, px: 2, mb: 2.5,
                bgcolor: '#E8F5E9', borderRadius: 2,
              }}
            >
              <Typography variant="caption" color="text.secondary">Receipt Number</Typography>
              <Typography variant="h6" fontWeight={700} color="success.main" sx={{ fontFamily: 'monospace', letterSpacing: 1 }}>
                {receiptData.receiptNumber}
              </Typography>
            </Paper>
          )}

          {/* Payment Summary */}
          <Paper elevation={0} sx={{ p: 2.5, mb: 2.5, bgcolor: '#f8f9fa', borderRadius: 2, border: '1px solid #e0e0e0' }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>Payment Summary</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">Course</Typography>
              <Typography variant="body2" fontWeight={500}>{receiptData?.courseName || details?.courseName || 'Architecture Course'}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">Date</Typography>
              <Typography variant="body2">{paidDate}</Typography>
            </Box>
            {receiptData?.razorpayPaymentId && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" color="text.secondary">Payment ID</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {receiptData.razorpayPaymentId}
                </Typography>
              </Box>
            )}
            <Divider sx={{ my: 1.5 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="subtitle1" fontWeight={700}>Amount Paid</Typography>
              <Typography variant="subtitle1" fontWeight={700} color="success.main">
                Rs. {Number(receiptData?.amount || 0).toLocaleString('en-IN')}
              </Typography>
            </Box>
          </Paper>

          {/* What's Next */}
          <Paper elevation={0} sx={{ p: 2.5, mb: 3, bgcolor: '#E3F2FD', borderRadius: 2 }}>
            <Typography variant="subtitle2" fontWeight={600} color="primary" sx={{ mb: 1.5 }}>What&apos;s Next?</Typography>
            {[
              'Confirmation email sent to your inbox',
              'Batch allocation within 2 business days',
              'Join WhatsApp group for class updates',
              'Access Neram Nexus online classroom',
            ].map((step, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', mb: 1 }}>
                <Box
                  sx={{
                    width: 22, height: 22, borderRadius: '50%', bgcolor: 'primary.main',
                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, mr: 1.5, mt: 0.2, flexShrink: 0,
                  }}
                >
                  {i + 1}
                </Box>
                <Typography variant="body2">{step}</Typography>
              </Box>
            ))}
          </Paper>

          <Button variant="contained" href="/welcome" fullWidth sx={{ py: 1.5, fontWeight: 600, borderRadius: 2 }}>
            Continue to Dashboard
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
  const showInstallmentOption = details.allowedPaymentModes === 'full_and_installment';

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

              {/* Full Payment Card - BEST VALUE */}
              <Paper
                variant="outlined"
                onClick={() => setSelectedScheme('full')}
                sx={{
                  p: 2, mb: showInstallmentOption ? 1.5 : 0, cursor: 'pointer', borderWidth: 2, borderRadius: 2,
                  borderColor: selectedScheme === 'full' ? 'success.main' : 'grey.200',
                  bgcolor: selectedScheme === 'full' ? '#E8F5E9' : 'transparent',
                  transition: 'all 0.2s',
                  position: 'relative',
                  overflow: 'visible',
                }}
              >
                {/* BEST VALUE Badge */}
                {details.fullPaymentDiscount > 0 && (
                  <Chip
                    icon={<StarIcon sx={{ fontSize: 14 }} />}
                    label="BEST VALUE"
                    color="success"
                    size="small"
                    sx={{
                      position: 'absolute', top: -12, right: 12,
                      fontWeight: 800, fontSize: 10, letterSpacing: 0.5,
                    }}
                  />
                )}

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SavingsIcon sx={{ color: 'success.main', fontSize: 20 }} />
                  <Typography fontWeight={700} sx={{ fontSize: 14 }}>Full Payment</Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 1 }}>
                  <Typography variant="h5" fontWeight={800} color="success.main">
                    Rs. {details.fullPaymentAmount.toLocaleString('en-IN')}
                  </Typography>
                  {details.fullPaymentDiscount > 0 && (
                    <Typography
                      variant="body2"
                      sx={{ textDecoration: 'line-through', color: 'text.disabled' }}
                    >
                      Rs. {details.finalFee.toLocaleString('en-IN')}
                    </Typography>
                  )}
                </Box>

                {details.fullPaymentDiscount > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                    <Typography variant="body2" color="success.main" fontWeight={600} sx={{ fontSize: 13 }}>
                      You save Rs. {details.fullPaymentDiscount.toLocaleString('en-IN')}!
                    </Typography>
                  </Box>
                )}

                <Typography variant="caption" color="text.secondary">
                  One-time payment - Instant enrollment
                </Typography>
              </Paper>

              {/* Installment Card - Only show if admin allows */}
              {showInstallmentOption && (
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
                    <ScheduleIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                    <Typography fontWeight={700} sx={{ fontSize: 14 }}>2 Installments</Typography>
                  </Box>
                  <Typography variant="h5" fontWeight={800} color="primary.main" sx={{ mt: 1 }}>
                    Rs. {details.installment1Amount.toLocaleString('en-IN')}
                    <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.5, fontWeight: 400 }}>now</Typography>
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    + Rs. {details.installment2Amount.toLocaleString('en-IN')} in {details.installment2DueDays} days
                  </Typography>
                </Paper>
              )}

              {/* Nudge banner for installment users */}
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

                {couponApplied && couponDiscount > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', color: 'success.main' }}>
                    <Typography variant="body2">Coupon Discount</Typography>
                    <Typography variant="body2" fontWeight={600}>- Rs. {couponDiscount.toLocaleString('en-IN')}</Typography>
                  </Box>
                )}

                {youtubeCouponApplied && youtubeDiscount > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', color: 'success.main' }}>
                    <Typography variant="body2">YouTube Subscriber Discount</Typography>
                    <Typography variant="body2" fontWeight={600}>- Rs. {youtubeDiscount.toLocaleString('en-IN')}</Typography>
                  </Box>
                )}

                {totalDiscounts > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', color: 'success.main', bgcolor: '#E8F5E9', p: 0.75, borderRadius: 1 }}>
                    <Typography variant="body2" fontWeight={700}>Total Savings</Typography>
                    <Typography variant="body2" fontWeight={700}>
                      Rs. {(
                        (selectedScheme === 'full' ? details.fullPaymentDiscount : 0)
                        + details.scholarshipDiscount
                        + totalDiscounts
                      ).toLocaleString('en-IN')}
                    </Typography>
                  </Box>
                )}

                <Divider />

                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    {selectedScheme === 'installment' ? 'Pay Now (1st Installment)' : 'Amount to Pay'}
                  </Typography>
                  <Typography variant="subtitle1" color="primary" fontWeight={800}>
                    Rs. {payableAmount.toLocaleString('en-IN')}
                  </Typography>
                </Box>

                {selectedScheme === 'installment' && (
                  <Alert severity="info" sx={{ borderRadius: 1.5 }}>
                    <Typography variant="body2" sx={{ fontSize: 12 }}>
                      2nd installment of <strong>Rs. {details.installment2Amount.toLocaleString('en-IN')}</strong> due in {details.installment2DueDays} days
                    </Typography>
                  </Alert>
                )}
              </Stack>

              {/* Coupon Code Section */}
              <Box sx={{ mt: 2.5 }}>
                {details.hasCoupon && !couponApplied && (
                  <Alert severity="info" sx={{ mb: 1.5, borderRadius: 1.5 }}>
                    <Typography variant="body2" sx={{ fontSize: 12.5 }}>
                      A special coupon has been generated for you! Apply it below.
                    </Typography>
                  </Alert>
                )}

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
                  <Chip
                    label={`Coupon Applied! -Rs. ${couponDiscount.toLocaleString('en-IN')}`}
                    color="success"
                    size="small"
                    sx={{ mt: 1 }}
                  />
                )}
              </Box>

              {/* YouTube Subscribe & Save */}
              {!youtubeCouponApplied && (
                <Box sx={{ mt: 2.5, p: 2, bgcolor: '#FFF3E0', borderRadius: 2, border: '1px solid #FFE0B2' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <YouTubeIcon sx={{ color: '#FF0000', fontSize: 22 }} />
                    <Typography variant="subtitle2" fontWeight={600} sx={{ fontSize: 13 }}>
                      Subscribe & Save Rs. 50
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5, fontSize: 12 }}>
                    Subscribe to our YouTube channel and get an instant Rs. 50 discount!
                  </Typography>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleYouTubeSubscribe}
                    disabled={youtubeLoading}
                    startIcon={youtubeLoading ? <CircularProgress size={16} /> : <YouTubeIcon />}
                    sx={{
                      borderColor: '#FF0000', color: '#FF0000',
                      '&:hover': { borderColor: '#CC0000', bgcolor: '#FFF3E0' },
                    }}
                  >
                    {youtubeLoading ? 'Verifying...' : 'Subscribe & Get Rs. 50 Off'}
                  </Button>
                </Box>
              )}
              {youtubeCouponApplied && (
                <Box sx={{ mt: 2.5, p: 1.5, bgcolor: '#E8F5E9', borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CheckCircleIcon sx={{ color: 'success.main', fontSize: 18 }} />
                    <Typography variant="body2" fontWeight={600} color="success.main" sx={{ fontSize: 12.5 }}>
                      YouTube discount applied! -Rs. 50
                    </Typography>
                  </Box>
                </Box>
              )}

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
