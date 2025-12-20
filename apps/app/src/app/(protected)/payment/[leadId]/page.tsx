'use client';

import { useState, useEffect } from 'react';
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
import { useFirebaseAuth } from '@neram/auth';

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface PaymentDetails {
  leadProfileId: string;
  courseName: string;
  baseFee: number;
  scholarshipDiscount: number;
  couponDiscount: number;
  finalFee: number;
  paymentScheme: 'full' | 'installment';
  installment1: number;
  installment2: number;
  paymentDeadline: string;
  cashbackEligible: number;
}

// Mock data - replace with API call
const mockPaymentDetails: PaymentDetails = {
  leadProfileId: '1',
  courseName: 'NATA & JEE Combined Course',
  baseFee: 45000,
  scholarshipDiscount: 42750, // 95%
  couponDiscount: 0,
  finalFee: 2250,
  paymentScheme: 'full',
  installment1: 1125,
  installment2: 1125,
  paymentDeadline: '2025-02-15',
  cashbackEligible: 100,
};

export default function PaymentPage({ params }: { params: { leadId: string } }) {
  const router = useRouter();
  const { user } = useFirebaseAuth();
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);
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

  useEffect(() => {
    // Fetch payment details
    setPaymentDetails(mockPaymentDetails);
  }, [params.leadId]);

  const handleApplyCoupon = async () => {
    setCouponError('');
    try {
      const response = await fetch('/api/coupon/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode, leadProfileId: params.leadId }),
      });

      if (response.ok) {
        const { discount } = await response.json();
        setPaymentDetails((prev) => prev ? {
          ...prev,
          couponDiscount: discount,
          finalFee: prev.baseFee - prev.scholarshipDiscount - discount,
        } : null);
        setCouponApplied(true);
      } else {
        setCouponError('Invalid or expired coupon code');
      }
    } catch {
      setCouponError('Failed to apply coupon');
    }
  };

  const handleRazorpayPayment = async () => {
    if (!paymentDetails || !user) return;

    setIsProcessing(true);

    try {
      // Create order
      const response = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadProfileId: params.leadId,
          paymentScheme: paymentDetails.paymentScheme,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create order');
      }

      const { order, paymentId, keyId } = await response.json();

      // Open Razorpay checkout
      const options = {
        key: keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'Neram Classes',
        description: paymentDetails.courseName,
        order_id: order.id,
        prefill: {
          name: user.name,
          email: user.email,
          contact: user.phone,
        },
        theme: {
          color: '#1565C0',
        },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          // Verify payment
          const verifyResponse = await fetch('/api/payment/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...response,
              paymentId,
            }),
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
    } catch (error) {
      console.error('Payment error:', error);
      alert('Failed to initiate payment. Please try again.');
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
      formData.append('amount', String(paymentDetails?.finalFee || 0));
      formData.append('utrNumber', directPayDetails.utrNumber);
      formData.append('payerName', directPayDetails.payerName);
      formData.append('paymentMethod', 'upi');
      // Screenshot is already uploaded, just send the URL
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

  if (paymentSuccess) {
    return (
      <Container maxWidth="sm">
        <Paper sx={{ p: 4, textAlign: 'center', mt: 4 }}>
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              bgcolor: 'success.light',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 3,
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

          {paymentDetails && paymentDetails.cashbackEligible > 0 && (
            <Alert severity="success" sx={{ textAlign: 'left', mb: 3 }}>
              <Typography variant="body2">
                You've earned <strong>Rs. {paymentDetails.cashbackEligible + (paymentMethod === 'direct' ? 100 : 0)} cashback</strong>!
                It will be transferred to your registered mobile number within 7 days.
              </Typography>
            </Alert>
          )}

          <Button
            variant="contained"
            href="/dashboard"
            sx={{ mt: 2 }}
          >
            Go to Dashboard
          </Button>
        </Paper>
      </Container>
    );
  }

  if (!paymentDetails) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" />

      <Box>
        <Typography variant="h4" gutterBottom fontWeight={600}>
          Complete Your Payment
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Secure payment for {paymentDetails.courseName}
        </Typography>

        <Grid container spacing={3}>
          {/* Fee Summary */}
          <Grid item xs={12} md={5}>
            <Paper sx={{ p: 3, position: 'sticky', top: 24 }}>
              <Typography variant="h6" gutterBottom>
                Fee Summary
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <Stack spacing={1.5}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography>Course Fee:</Typography>
                  <Typography>Rs. {paymentDetails.baseFee.toLocaleString()}</Typography>
                </Box>

                {paymentDetails.scholarshipDiscount > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', color: 'success.main' }}>
                    <Typography>Scholarship Discount:</Typography>
                    <Typography>- Rs. {paymentDetails.scholarshipDiscount.toLocaleString()}</Typography>
                  </Box>
                )}

                {paymentDetails.couponDiscount > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', color: 'success.main' }}>
                    <Typography>Coupon Discount:</Typography>
                    <Typography>- Rs. {paymentDetails.couponDiscount.toLocaleString()}</Typography>
                  </Box>
                )}

                <Divider />

                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="h6">Amount to Pay:</Typography>
                  <Typography variant="h6" color="primary">
                    Rs. {paymentDetails.finalFee.toLocaleString()}
                  </Typography>
                </Box>

                {paymentDetails.paymentScheme === 'installment' && (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    <Typography variant="body2">
                      <strong>Installment Plan:</strong>
                      <br />
                      1st Payment: Rs. {paymentDetails.installment1.toLocaleString()} (Now)
                      <br />
                      2nd Payment: Rs. {paymentDetails.installment2.toLocaleString()} (After 30 days)
                    </Typography>
                  </Alert>
                )}
              </Stack>

              {/* Coupon Code */}
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
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
                  />
                  <Button
                    variant="outlined"
                    onClick={handleApplyCoupon}
                    disabled={!couponCode || couponApplied}
                    startIcon={<LocalOfferIcon />}
                  >
                    Apply
                  </Button>
                </Box>
                {couponApplied && (
                  <Chip
                    label="Coupon Applied!"
                    color="success"
                    size="small"
                    sx={{ mt: 1 }}
                    onDelete={() => {
                      setCouponApplied(false);
                      setCouponCode('');
                      setPaymentDetails((prev) => prev ? {
                        ...prev,
                        couponDiscount: 0,
                        finalFee: prev.baseFee - prev.scholarshipDiscount,
                      } : null);
                    }}
                  />
                )}
              </Box>

              {/* Cashback Info */}
              {paymentDetails.cashbackEligible > 0 && (
                <Alert severity="success" sx={{ mt: 3 }}>
                  <Typography variant="body2">
                    You'll receive <strong>Rs. {paymentDetails.cashbackEligible}</strong> cashback after enrollment!
                    {paymentMethod === 'direct' && (
                      <> Plus <strong>Rs. 100</strong> extra for direct payment!</>
                    )}
                  </Typography>
                </Alert>
              )}

              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2 }}>
                Payment deadline: {new Date(paymentDetails.paymentDeadline).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </Typography>
            </Paper>
          </Grid>

          {/* Payment Methods */}
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
                    p: 2,
                    mb: 2,
                    border: '2px solid',
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
                    p: 2,
                    border: '2px solid',
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
                          <Chip label="+Rs. 100 Cashback" color="success" size="small" />
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
                      Please transfer <strong>Rs. {paymentDetails.finalFee.toLocaleString()}</strong> and upload the screenshot below.
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
                >
                  {isProcessing
                    ? 'Processing...'
                    : paymentMethod === 'razorpay'
                    ? `Pay Rs. ${paymentDetails.finalFee.toLocaleString()}`
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
