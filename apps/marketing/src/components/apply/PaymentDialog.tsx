// @ts-nocheck
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Alert,
  Chip,
  Divider,
  TextField,
  Stack,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  SwipeableDrawer,
  IconButton,
} from '@neram/ui';
import {
  CloseIcon,
  CheckCircleIcon,
  StarIcon,
} from '@neram/ui';
import { useIsMobile } from '@neram/ui/hooks';
import { useFirebaseAuth } from '@neram/auth';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import LegalDrawer from '../legal/LegalDrawer';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import SavingsIcon from '@mui/icons-material/Savings';
import YouTubeIcon from '@mui/icons-material/YouTube';
import ScheduleIcon from '@mui/icons-material/Schedule';
import YouTubeSubscribeModal from '../YouTubeSubscribeModal';
import ReceiptDownload from './ReceiptDownload';
import confetti from 'canvas-confetti';

function fireSavingsConfetti() {
  // Left burst
  confetti({
    particleCount: 60,
    spread: 55,
    origin: { x: 0.25, y: 0.6 },
    colors: ['#4CAF50', '#FFC107', '#FF5722', '#2196F3', '#E91E63'],
    scalar: 0.8,
    gravity: 1.2,
    ticks: 120,
  });
  // Right burst
  confetti({
    particleCount: 60,
    spread: 55,
    origin: { x: 0.75, y: 0.6 },
    colors: ['#4CAF50', '#FFC107', '#FF5722', '#2196F3', '#E91E63'],
    scalar: 0.8,
    gravity: 1.2,
    ticks: 120,
  });
}

// ── Session persistence for user choices ──
const PAYMENT_CACHE_PREFIX = 'neram_payment_';

interface PaymentChoicesCache {
  selectedScheme: 'full' | 'installment';
  paymentMethod: 'razorpay' | 'direct';
  couponCode: string;
  couponApplied: boolean;
  couponDiscount: number;
  youtubeCouponApplied: boolean;
  youtubeDiscount: number;
}

function getSavedChoices(leadId: string): PaymentChoicesCache | null {
  try {
    const raw = sessionStorage.getItem(PAYMENT_CACHE_PREFIX + leadId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveChoices(leadId: string, choices: PaymentChoicesCache) {
  try {
    sessionStorage.setItem(PAYMENT_CACHE_PREFIX + leadId, JSON.stringify(choices));
  } catch {
    // sessionStorage unavailable
  }
}

function clearSavedChoices(leadId: string) {
  try {
    sessionStorage.removeItem(PAYMENT_CACHE_PREFIX + leadId);
  } catch {
    // ignore
  }
}

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
  userName: string;
  userEmail: string;
  userPhone: string;
}

interface PaymentDialogProps {
  open: boolean;
  leadId: string | null;
  onClose: () => void;
  onPaymentComplete?: () => void;
}

export default function PaymentDialog({ open, leadId, onClose, onPaymentComplete }: PaymentDialogProps) {
  const isMobile = useIsMobile();
  const { user } = useFirebaseAuth();

  const [details, setDetails] = useState<PaymentDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedScheme, setSelectedScheme] = useState<'full' | 'installment'>('full');
  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'direct'>('razorpay');

  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  const [youtubeCouponApplied, setYoutubeCouponApplied] = useState(false);
  const [youtubeDiscount, setYoutubeDiscount] = useState(0);
  const [youtubeModalOpen, setYoutubeModalOpen] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // When closing after a successful payment, notify parent to refresh data
  const handleClose = useCallback(() => {
    if (paymentSuccess) {
      onPaymentComplete?.();
    }
    onClose();
  }, [paymentSuccess, onPaymentComplete, onClose]);
  const [receiptData, setReceiptData] = useState<{
    receiptNumber: string | null;
    amount: number;
    razorpayPaymentId: string;
    paidAt: string;
    courseName: string;
    paymentScheme: string;
  } | null>(null);
  const [legalDrawerOpen, setLegalDrawerOpen] = useState(false);
  const [legalDrawerTab, setLegalDrawerTab] = useState(0);

  // Savings celebration banner
  const [savingsBanner, setSavingsBanner] = useState<{ amount: number; label: string } | null>(null);
  const savingsBannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoAppliedRef = useRef(false);

  const showSavingsCelebration = useCallback((amount: number, label: string) => {
    if (savingsBannerTimer.current) clearTimeout(savingsBannerTimer.current);
    setSavingsBanner({ amount, label });
    fireSavingsConfetti();
    savingsBannerTimer.current = setTimeout(() => setSavingsBanner(null), 4000);
  }, []);

  const getIdToken = useCallback(async () => {
    try {
      return await (user?.raw as any)?.getIdToken?.();
    } catch {
      return null;
    }
  }, [user]);

  const fetchPaymentDetails = useCallback(async () => {
    if (!leadId || !open) return;
    setLoading(true);
    setError('');
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Not authenticated');

      const res = await fetch(`/api/payment/details/${leadId}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load payment details');
      }
      const data: PaymentDetailsResponse = await res.json();
      setDetails(data);
      // Only set default scheme if no saved preference exists
      const saved = getSavedChoices(leadId!);
      if (!saved) {
        setSelectedScheme(data.paymentRecommendation === 'installment' ? 'installment' : 'full');
      }

      // Pre-fill admin-assigned coupon (user clicks Apply manually)
      if (data.adminCouponCode && !couponApplied && !autoAppliedRef.current) {
        setCouponCode(data.adminCouponCode);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [leadId, open, getIdToken, couponApplied]);

  // Persist user choices to sessionStorage whenever they change
  useEffect(() => {
    if (!leadId || !details) return; // only save once details loaded
    saveChoices(leadId, {
      selectedScheme,
      paymentMethod,
      couponCode,
      couponApplied,
      couponDiscount,
      youtubeCouponApplied,
      youtubeDiscount,
    });
  }, [leadId, details, selectedScheme, paymentMethod, couponCode, couponApplied, couponDiscount, youtubeCouponApplied, youtubeDiscount]);

  useEffect(() => {
    if (open && leadId) {
      // Restore persisted choices or reset
      const saved = getSavedChoices(leadId);
      setPaymentSuccess(false);
      setIsProcessing(false);
      setSavingsBanner(null);
      setCouponError('');

      if (saved) {
        setSelectedScheme(saved.selectedScheme);
        setPaymentMethod(saved.paymentMethod);
        setCouponCode(saved.couponCode);
        setCouponApplied(saved.couponApplied);
        setCouponDiscount(saved.couponDiscount);
        setYoutubeCouponApplied(saved.youtubeCouponApplied);
        setYoutubeDiscount(saved.youtubeDiscount);
        // Skip auto-apply if coupon was already applied previously
        autoAppliedRef.current = saved.couponApplied;
      } else {
        setCouponApplied(false);
        setCouponDiscount(0);
        setCouponCode('');
        setYoutubeCouponApplied(false);
        setYoutubeDiscount(0);
        autoAppliedRef.current = false;
      }

      fetchPaymentDetails();
    }
  }, [open, leadId]);

  // Load Razorpay script when dialog opens
  useEffect(() => {
    if (!open) return;
    if (document.querySelector('script[src*="razorpay"]')) return;
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
  }, [open]);

  const totalDiscounts = couponDiscount + youtubeDiscount;

  const getPayableAmount = () => {
    if (!details) return 0;
    let amount: number;
    if (selectedScheme === 'full') {
      amount = details.fullPaymentAmount;
    } else {
      amount = details.installment1Amount;
    }
    amount = Math.max(0, amount - totalDiscounts);
    return amount;
  };

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
          leadProfileId: leadId,
          amount: details.finalFee,
        }),
      });

      const result = await response.json();

      if (result.valid) {
        setCouponApplied(true);
        setCouponDiscount(result.discountAmount || 0);
        showSavingsCelebration(result.discountAmount || 0, 'Coupon');
      } else {
        setCouponError(result.error || 'Invalid or expired coupon code');
      }
    } catch {
      setCouponError('Failed to apply coupon');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleYouTubeSubscribe = () => {
    setYoutubeModalOpen(true);
  };

  const handleYouTubeSuccess = ({ discount }: { couponCode: string; discount: number }) => {
    setYoutubeCouponApplied(true);
    setYoutubeDiscount(discount);
    setYoutubeModalOpen(false);
    showSavingsCelebration(discount, 'YouTube Subscriber');
  };

  const handleRazorpayPayment = async () => {
    if (!details || !user) return;
    setIsProcessing(true);

    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Not authenticated');

      const response = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          leadProfileId: leadId,
          paymentScheme: selectedScheme,
          couponCode: couponApplied ? couponCode : null,
          couponDiscount: couponApplied ? couponDiscount : 0,
          youtubeDiscount: youtubeCouponApplied ? youtubeDiscount : 0,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Failed to create order');
      }

      const { order, paymentId, keyId } = await response.json();

      const prefillName = details.userName || user.name || '';
      const prefillEmail = details.userEmail || user.email || '';
      const prefillContact = details.userPhone || user.phone || '';

      const options = {
        key: keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'Neram Classes',
        description: details.courseName,
        order_id: order.id,
        prefill: {
          name: prefillName,
          email: prefillEmail,
          contact: prefillContact,
        },
        // Skip contact details step if we have the info
        ...(prefillContact && prefillEmail ? {
          readonly: { contact: true, email: true },
        } : {}),
        theme: { color: '#1565C0' },
        handler: async (razorpayResponse: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verifyIdToken = await getIdToken();
            const verifyResponse = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${verifyIdToken}`,
              },
              body: JSON.stringify({ ...razorpayResponse, paymentId }),
            });

            if (verifyResponse.ok) {
              const verifyData = await verifyResponse.json();
              setReceiptData(verifyData.receipt || null);
              setPaymentSuccess(true);
              // Fire confetti for payment success
              fireSavingsConfetti();
              if (leadId) clearSavedChoices(leadId);
              // Note: onPaymentComplete is called when user closes the dialog or clicks "Go to Dashboard"
            } else {
              setError('Payment verification failed. Please contact support.');
            }
          } catch {
            setError('Payment verification failed. Please contact support.');
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
      setError(error.message || 'Failed to initiate payment. Please try again.');
      setIsProcessing(false);
    }
  };

  const payableAmount = getPayableAmount();
  const showInstallmentOption = details?.allowedPaymentModes === 'full_and_installment';

  // ── Content ──

  const renderContent = () => {
    // Success screen - Order confirmation style
    if (paymentSuccess) {
      const paidDate = receiptData?.paidAt
        ? new Date(receiptData.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
        : new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

      return (
        <Box sx={{ py: 3, px: 2 }}>
          {/* Success Header */}
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Box
              sx={{
                width: 72, height: 72, borderRadius: '50%', bgcolor: '#E8F5E9',
                display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2,
              }}
            >
              <CheckCircleIcon sx={{ fontSize: 44, color: 'success.main' }} />
            </Box>
            <Typography variant="h6" fontWeight={700} gutterBottom>
              Payment Confirmed!
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Welcome to Neram Classes
            </Typography>
          </Box>

          {/* Receipt Number */}
          {receiptData?.receiptNumber && (
            <Paper
              elevation={0}
              sx={{
                textAlign: 'center', py: 1.5, px: 2, mb: 2,
                bgcolor: '#E8F5E9', borderRadius: 1,
              }}
            >
              <Typography variant="caption" color="text.secondary">Receipt Number</Typography>
              <Typography variant="subtitle1" fontWeight={700} color="success.main" sx={{ fontFamily: 'monospace', letterSpacing: 1 }}>
                {receiptData.receiptNumber}
              </Typography>
            </Paper>
          )}

          {/* Payment Summary */}
          <Paper elevation={0} sx={{ p: 2, mb: 2, bgcolor: '#f8f9fa', borderRadius: 1, border: '1px solid #e0e0e0' }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>Payment Summary</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
              <Typography variant="body2" color="text.secondary">Course</Typography>
              <Typography variant="body2" fontWeight={500}>{receiptData?.courseName || details?.courseName || 'Architecture Course'}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
              <Typography variant="body2" color="text.secondary">Date</Typography>
              <Typography variant="body2">{paidDate}</Typography>
            </Box>
            {receiptData?.razorpayPaymentId && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                <Typography variant="body2" color="text.secondary">Payment ID</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                  {receiptData.razorpayPaymentId}
                </Typography>
              </Box>
            )}
            <Divider sx={{ my: 1.5 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="subtitle2" fontWeight={700}>Amount Paid</Typography>
              <Typography variant="subtitle2" fontWeight={700} color="success.main">
                Rs. {Number(receiptData?.amount || payableAmount).toLocaleString('en-IN')}
              </Typography>
            </Box>
          </Paper>

          {/* What's Next */}
          <Paper elevation={0} sx={{ p: 2, mb: 3, bgcolor: '#E3F2FD', borderRadius: 1 }}>
            <Typography variant="subtitle2" fontWeight={600} color="primary" sx={{ mb: 1 }}>What&apos;s Next?</Typography>
            {[
              'Confirmation email sent to your inbox',
              'Batch allocation within 2 business days',
              'Join WhatsApp group for class updates',
              'Access Neram Nexus online classroom',
            ].map((step, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', mb: 0.75 }}>
                <Box
                  sx={{
                    width: 20, height: 20, borderRadius: '50%', bgcolor: 'primary.main',
                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, mr: 1, mt: 0.25, flexShrink: 0,
                  }}
                >
                  {i + 1}
                </Box>
                <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{step}</Typography>
              </Box>
            ))}
          </Paper>

          {/* Actions */}
          <Stack spacing={1.5}>
            <Button
              variant="contained"
              onClick={() => {
                onPaymentComplete?.();
                const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';
                window.location.href = `${appUrl}/welcome`;
              }}
              fullWidth
              sx={{ py: 1.25, fontWeight: 600, borderRadius: 1 }}
            >
              Go to Dashboard
            </Button>
            {receiptData && (
              <ReceiptDownload
                receiptData={{
                  receiptNumber: receiptData.receiptNumber || '',
                  amount: Number(receiptData.amount || payableAmount),
                  razorpayPaymentId: receiptData.razorpayPaymentId,
                  paidAt: receiptData.paidAt || new Date().toISOString(),
                  courseName: receiptData.courseName || details?.courseName || 'Architecture Course',
                  paymentScheme: receiptData.paymentScheme,
                }}
                studentName={user?.displayName || user?.name || ''}
                variant="outlined"
                fullWidth
              />
            )}
          </Stack>
        </Box>
      );
    }

    // Loading
    if (loading) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6 }}>
          <CircularProgress size={36} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Loading payment details...
          </Typography>
        </Box>
      );
    }

    // Error
    if (error || !details) {
      return (
        <Box sx={{ p: 2 }}>
          <Alert severity="error" sx={{ mb: 2 }}>{error || 'Failed to load payment details'}</Alert>
          <Button variant="outlined" onClick={fetchPaymentDetails} fullWidth>Retry</Button>
        </Box>
      );
    }

    // Already paid — show rich confirmation with receipt & next steps
    if (details.remainingAmount <= 0) {
      const lastPayment = details.payments?.find((p: any) => p.status === 'paid') || details.payments?.[0];
      const paidDate = lastPayment?.paid_at
        ? new Date(lastPayment.paid_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
        : '';
      const receiptNum = lastPayment?.receipt_number;
      const razorpayId = lastPayment?.razorpay_payment_id;

      return (
        <Box sx={{ py: 3, px: 2 }}>
          {/* Success Header */}
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Box
              sx={{
                width: 72, height: 72, borderRadius: '50%', bgcolor: '#E8F5E9',
                display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2,
              }}
            >
              <CheckCircleIcon sx={{ fontSize: 44, color: 'success.main' }} />
            </Box>
            <Typography variant="h6" fontWeight={700} gutterBottom>
              You&apos;re Enrolled!
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Your fees are fully paid. Welcome to Neram Classes!
            </Typography>
          </Box>

          {/* Receipt Number */}
          {receiptNum && (
            <Paper
              elevation={0}
              sx={{
                textAlign: 'center', py: 1.5, px: 2, mb: 2,
                bgcolor: '#E8F5E9', borderRadius: 1,
              }}
            >
              <Typography variant="caption" color="text.secondary">Receipt Number</Typography>
              <Typography variant="subtitle1" fontWeight={700} color="success.main" sx={{ fontFamily: 'monospace', letterSpacing: 1 }}>
                {receiptNum}
              </Typography>
            </Paper>
          )}

          {/* Payment Summary */}
          <Paper elevation={0} sx={{ p: 2, mb: 2, bgcolor: '#f8f9fa', borderRadius: 1, border: '1px solid #e0e0e0' }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>Payment Summary</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
              <Typography variant="body2" color="text.secondary">Course</Typography>
              <Typography variant="body2" fontWeight={500}>{details.courseName}</Typography>
            </Box>
            {paidDate && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                <Typography variant="body2" color="text.secondary">Date</Typography>
                <Typography variant="body2">{paidDate}</Typography>
              </Box>
            )}
            {razorpayId && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                <Typography variant="body2" color="text.secondary">Payment ID</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                  {razorpayId}
                </Typography>
              </Box>
            )}
            <Divider sx={{ my: 1.5 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="subtitle2" fontWeight={700}>Total Paid</Typography>
              <Typography variant="subtitle2" fontWeight={700} color="success.main">
                Rs. {Number(details.totalPaid).toLocaleString('en-IN')}
              </Typography>
            </Box>
          </Paper>

          {/* What's Next */}
          <Paper elevation={0} sx={{ p: 2, mb: 3, bgcolor: '#E3F2FD', borderRadius: 1 }}>
            <Typography variant="subtitle2" fontWeight={600} color="primary" sx={{ mb: 1 }}>What&apos;s Next?</Typography>
            {[
              'Complete your profile on the student app',
              'Join WhatsApp group for class updates',
              'Install Microsoft Teams for online classes',
              'Batch allocation within 2 business days',
            ].map((step, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', mb: 0.75 }}>
                <Box
                  sx={{
                    width: 20, height: 20, borderRadius: '50%', bgcolor: 'primary.main',
                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, mr: 1, mt: 0.25, flexShrink: 0,
                  }}
                >
                  {i + 1}
                </Box>
                <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{step}</Typography>
              </Box>
            ))}
          </Paper>

          {/* Actions */}
          <Stack spacing={1.5}>
            <Button
              variant="contained"
              onClick={() => {
                onPaymentComplete?.();
                const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';
                window.location.href = `${appUrl}/welcome`;
              }}
              fullWidth
              sx={{ py: 1.25, fontWeight: 600, borderRadius: 1 }}
            >
              Go to Dashboard
            </Button>
            {lastPayment && (
              <ReceiptDownload
                receiptData={{
                  receiptNumber: receiptNum || '',
                  amount: Number(details.totalPaid),
                  razorpayPaymentId: razorpayId || '',
                  paidAt: lastPayment.paid_at || '',
                  courseName: details.courseName,
                  paymentScheme: details.paymentScheme || 'full',
                }}
                studentName={details.userName || user?.displayName || user?.name || ''}
                variant="outlined"
                fullWidth
              />
            )}
          </Stack>
        </Box>
      );
    }

    return (
      <Stack spacing={2.5} sx={{ pb: 2 }}>
        {/* Savings Celebration Banner */}
        {savingsBanner && (
          <Box
            sx={{
              textAlign: 'center',
              py: 1.5,
              px: 2,
              bgcolor: '#E8F5E9',
              borderRadius: 1,
              border: '2px solid #4CAF50',
              animation: 'savingsBounce 0.5s ease-out',
              '@keyframes savingsBounce': {
                '0%': { transform: 'scale(0.8)', opacity: 0 },
                '60%': { transform: 'scale(1.05)' },
                '100%': { transform: 'scale(1)', opacity: 1 },
              },
            }}
          >
            <Typography variant="body2" fontWeight={800} color="success.main" sx={{ fontSize: 16 }}>
              You saved Rs. {savingsBanner.amount.toLocaleString('en-IN')}!
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {savingsBanner.label} discount applied successfully
            </Typography>
          </Box>
        )}

        {/* Course Header */}
        <Box>
          <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: 15 }}>
            {details.courseName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Secure your seat — complete payment below
          </Typography>
        </Box>

        {/* ── Payment Plan Selector ── */}
        <Box>
          <Typography variant="caption" fontWeight={700} sx={{ mb: 1, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
            Choose Payment Plan
          </Typography>

          {/* Full Payment Card */}
          <Paper
            variant="outlined"
            onClick={() => setSelectedScheme('full')}
            sx={{
              p: 2, mb: showInstallmentOption ? 1.5 : 0, cursor: 'pointer', borderWidth: 2, borderRadius: 1,
              borderColor: selectedScheme === 'full' ? 'success.main' : 'grey.200',
              bgcolor: selectedScheme === 'full' ? '#E8F5E9' : 'transparent',
              transition: 'all 0.2s',
              position: 'relative', overflow: 'visible',
            }}
          >
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
                <Typography variant="body2" sx={{ textDecoration: 'line-through', color: 'text.disabled' }}>
                  Rs. {details.finalFee.toLocaleString('en-IN')}
                </Typography>
              )}
            </Box>
            {details.fullPaymentDiscount > 0 && (
              <Typography variant="body2" color="success.main" fontWeight={600} sx={{ fontSize: 13, mt: 0.5 }}>
                You save Rs. {details.fullPaymentDiscount.toLocaleString('en-IN')}!
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary">
              One-time payment — Instant enrollment
            </Typography>
          </Paper>

          {/* Installment Card */}
          {showInstallmentOption && (
            <Paper
              variant="outlined"
              onClick={() => setSelectedScheme('installment')}
              sx={{
                p: 2, cursor: 'pointer', borderWidth: 2, borderRadius: 1,
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

          {/* Nudge for installment users */}
          {selectedScheme === 'installment' && details.fullPaymentDiscount > 0 && (
            <Alert severity="success" sx={{ mt: 1.5, borderRadius: 0.75 }}>
              <Typography variant="body2" sx={{ fontSize: 12.5 }}>
                Switch to full payment and <strong>save Rs. {details.fullPaymentDiscount.toLocaleString('en-IN')}!</strong>
              </Typography>
            </Alert>
          )}
        </Box>

        {/* ── Fee Summary ── */}
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
          <Typography variant="caption" fontWeight={700} sx={{ mb: 1, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
            Fee Summary
          </Typography>
          <Stack spacing={0.75}>
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
                <Typography variant="body2">YouTube Subscriber</Typography>
                <Typography variant="body2" fontWeight={600}>- Rs. {youtubeDiscount.toLocaleString('en-IN')}</Typography>
              </Box>
            )}

            <Divider sx={{ my: 0.5 }} />

            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="subtitle2" fontWeight={700}>
                {selectedScheme === 'installment' ? 'Pay Now (1st Installment)' : 'Amount to Pay'}
              </Typography>
              <Typography variant="subtitle1" color="primary" fontWeight={800}>
                Rs. {payableAmount.toLocaleString('en-IN')}
              </Typography>
            </Box>

            {selectedScheme === 'installment' && (
              <Alert severity="info" sx={{ borderRadius: 0.75, mt: 0.5 }}>
                <Typography variant="body2" sx={{ fontSize: 12 }}>
                  2nd installment of <strong>Rs. {details.installment2Amount.toLocaleString('en-IN')}</strong> due in {details.installment2DueDays} days
                </Typography>
              </Alert>
            )}
          </Stack>
        </Paper>

        {/* ── Coupon Code ── */}
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
          {details.hasCoupon && !couponApplied && (
            <Alert severity="info" sx={{ mb: 1.5, borderRadius: 0.75 }}>
              <Typography variant="body2" sx={{ fontSize: 12.5 }}>
                A special coupon has been generated for you! Apply it below.
              </Typography>
            </Alert>
          )}
          <Typography variant="caption" fontWeight={600} sx={{ mb: 0.75, display: 'block' }}>
            Have a coupon code?
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              size="small"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="Enter code"
              disabled={couponApplied || couponLoading}
              error={!!couponError}
              helperText={couponError}
              sx={{ flex: 1 }}
            />
            <Button
              variant="outlined"
              onClick={handleApplyCoupon}
              disabled={!couponCode || couponApplied || couponLoading}
              startIcon={couponLoading ? <CircularProgress size={16} /> : <LocalOfferIcon />}
              size="small"
              sx={{ minWidth: 90 }}
            >
              Apply
            </Button>
          </Box>
          {couponApplied && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1 }}>
              <CheckCircleIcon sx={{ color: 'success.main', fontSize: 18 }} />
              <Typography variant="body2" fontWeight={700} color="success.main" sx={{ fontSize: 13 }}>
                Coupon Applied! You save Rs. {couponDiscount.toLocaleString('en-IN')}
              </Typography>
            </Box>
          )}
        </Paper>

        {/* ── YouTube Subscribe & Save ── */}
        {!youtubeCouponApplied ? (
          <Box sx={{ p: 2, bgcolor: '#FFF3E0', borderRadius: 1, border: '1px solid #FFE0B2' }}>
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
              startIcon={<YouTubeIcon />}
              sx={{
                borderColor: '#FF0000', color: '#FF0000',
                '&:hover': { borderColor: '#CC0000', bgcolor: '#FFF3E0' },
              }}
            >
              Subscribe & Get Rs. 50 Off
            </Button>
          </Box>
        ) : (
          <Box sx={{ p: 1.5, bgcolor: '#E8F5E9', borderRadius: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircleIcon sx={{ color: 'success.main', fontSize: 18 }} />
              <Typography variant="body2" fontWeight={600} color="success.main" sx={{ fontSize: 12.5 }}>
                YouTube discount applied! -Rs. 50
              </Typography>
            </Box>
          </Box>
        )}

        {/* ── Payment Method ── */}
        <Box>
          <Typography variant="caption" fontWeight={700} sx={{ mb: 1, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
            Payment Method
          </Typography>

          {/* Razorpay */}
          <Paper
            variant="outlined"
            onClick={() => setPaymentMethod('razorpay')}
            sx={{
              p: 2, mb: 1, cursor: 'pointer', borderWidth: 2, borderRadius: 1,
              borderColor: paymentMethod === 'razorpay' ? 'primary.main' : 'grey.200',
              transition: 'all 0.2s',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CreditCardIcon sx={{ color: paymentMethod === 'razorpay' ? 'primary.main' : 'text.secondary' }} />
              <Box>
                <Typography variant="body2" fontWeight={600}>Pay Online</Typography>
                <Typography variant="caption" color="text.secondary">UPI, Credit/Debit Card, Net Banking</Typography>
              </Box>
            </Box>
          </Paper>

          {/* Direct Payment */}
          <Paper
            variant="outlined"
            onClick={() => setPaymentMethod('direct')}
            sx={{
              p: 2, cursor: 'pointer', borderWidth: 2, borderRadius: 1,
              borderColor: paymentMethod === 'direct' ? 'primary.main' : 'grey.200',
              transition: 'all 0.2s',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AccountBalanceIcon sx={{ color: paymentMethod === 'direct' ? 'primary.main' : 'text.secondary' }} />
              <Box>
                <Typography variant="body2" fontWeight={600}>Direct UPI/Bank Transfer</Typography>
                <Typography variant="caption" color="text.secondary">Pay directly & upload screenshot</Typography>
              </Box>
            </Box>
          </Paper>
        </Box>

        {/* Direct Payment Info */}
        {paymentMethod === 'direct' && (
          <Alert severity="info" sx={{ borderRadius: 0.75 }}>
            <Typography variant="body2" fontWeight={600}>UPI ID: neramclasses@upi</Typography>
            <Typography variant="body2">Bank: HDFC Bank | A/C: 50200012345678 | IFSC: HDFC0001234</Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              Transfer <strong>Rs. {payableAmount.toLocaleString('en-IN')}</strong>, then contact support with the screenshot.
            </Typography>
          </Alert>
        )}

        {/* Payment deadline */}
        {details.paymentDeadline && (
          <Alert severity="warning" sx={{ borderRadius: 0.75 }}>
            <Typography variant="body2" sx={{ fontSize: 12.5 }}>
              Payment deadline: <strong>{new Date(details.paymentDeadline).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}</strong>
            </Typography>
          </Alert>
        )}

        {/* Error display */}
        {error && <Alert severity="error" sx={{ borderRadius: 0.75 }}>{error}</Alert>}

        {/* ── Pay Button ── */}
        <Button
          fullWidth
          variant="contained"
          size="large"
          onClick={paymentMethod === 'razorpay' ? handleRazorpayPayment : undefined}
          disabled={isProcessing || paymentMethod === 'direct'}
          startIcon={isProcessing ? <CircularProgress size={20} color="inherit" /> : null}
          sx={{
            py: 1.5, fontWeight: 700, fontSize: 16, borderRadius: 1,
            bgcolor: 'success.main',
            '&:hover': { bgcolor: 'success.dark' },
          }}
        >
          {isProcessing
            ? 'Processing...'
            : paymentMethod === 'razorpay'
            ? `Pay Rs. ${payableAmount.toLocaleString('en-IN')}`
            : 'Contact Support for Direct Payment'}
        </Button>

        <Typography variant="caption" color="text.secondary" textAlign="center" display="block">
          By proceeding, you agree to our{' '}
          <Box
            component="span"
            onClick={(e: React.MouseEvent) => { e.preventDefault(); setLegalDrawerTab(0); setLegalDrawerOpen(true); }}
            sx={{ color: 'primary.main', cursor: 'pointer', textDecoration: 'underline', '&:hover': { color: 'primary.dark' } }}
          >
            Terms & Conditions
          </Box>
          {' '}and{' '}
          <Box
            component="span"
            onClick={(e: React.MouseEvent) => { e.preventDefault(); setLegalDrawerTab(1); setLegalDrawerOpen(true); }}
            sx={{ color: 'primary.main', cursor: 'pointer', textDecoration: 'underline', '&:hover': { color: 'primary.dark' } }}
          >
            Refund Policy
          </Box>.
        </Typography>
      </Stack>
    );
  };

  // ── Render as bottom sheet (mobile) or dialog (desktop) ──

  const youtubeModal = (
    <YouTubeSubscribeModal
      open={youtubeModalOpen}
      onClose={() => setYoutubeModalOpen(false)}
      onSuccess={handleYouTubeSuccess}
    />
  );

  const legalDrawer = (
    <LegalDrawer
      open={legalDrawerOpen}
      onClose={() => setLegalDrawerOpen(false)}
      initialTab={legalDrawerTab}
    />
  );

  if (isMobile) {
    return (
      <>
        <SwipeableDrawer
          anchor="bottom"
          open={open}
          onClose={handleClose}
          onOpen={() => {}}
          disableSwipeToOpen
          PaperProps={{
            sx: {
              maxHeight: '92vh',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              overflow: 'hidden',
            },
          }}
        >
          {/* Drag handle */}
          <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1, pb: 0.5 }}>
            <Box sx={{ width: 36, height: 4, borderRadius: 1, bgcolor: 'grey.300' }} />
          </Box>

          {/* Header */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, pb: 1 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              {paymentSuccess ? 'Payment Complete' : 'Complete Payment'}
            </Typography>
            <IconButton size="small" onClick={handleClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
          <Divider />

          {/* Content */}
          <Box sx={{ overflow: 'auto', px: 2, pt: 2, pb: 3 }}>
            {renderContent()}
          </Box>
        </SwipeableDrawer>
        {youtubeModal}
        {legalDrawer}
      </>
    );
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={isProcessing ? undefined : handleClose}
        maxWidth="sm"
        fullWidth
        scroll="paper"
        PaperProps={{
          sx: { borderRadius: 1.5, maxHeight: '90vh' },
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Typography variant="h6" component="span" fontWeight={700}>
            {paymentSuccess ? 'Payment Complete' : 'Complete Payment'}
          </Typography>
          <IconButton size="small" onClick={handleClose} disabled={isProcessing}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          {renderContent()}
        </DialogContent>
      </Dialog>
      {youtubeModal}
      {legalDrawer}
    </>
  );
}
