// @ts-nocheck
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Typography, Button, TextField, Stack, CircularProgress, Skeleton } from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import CreditCardOutlined from '@mui/icons-material/CreditCardOutlined';
import AccountBalanceOutlined from '@mui/icons-material/AccountBalanceOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import SmartDisplayOutlined from '@mui/icons-material/SmartDisplayOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined';
import NorthEastOutlined from '@mui/icons-material/NorthEastOutlined';
import { tokens as t } from '@/design-system';
import LegalDrawer from '../legal/LegalDrawer';
import YouTubeSubscribeModal from '../YouTubeSubscribeModal';
import ReceiptDownload from './ReceiptDownload';
import RefundRequestButton from './RefundRequestButton';
import { iconTile40Sx, railCardSx, selectedCardSx, outlineButtonSx, inkRuleTopSx } from './styles';
import { APPLY_ERROR } from './shell/applyTheme';

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

export interface PaymentPanelState {
  paymentSuccess: boolean;
  isProcessing: boolean;
  /** True once the fee is paid, either just now or before the panel opened. */
  enrolled?: boolean;
}

interface PaymentPanelProps {
  leadId: string | null;
  /** False while a dialog around the panel is closed: no fetches, no script load. */
  active?: boolean;
  /**
   * 'inline' on the Pay and enrol step (the step shows the enrolment row and
   * owns the page h1); 'dialog' inside PaymentDialog, where the panel shows
   * the course itself and the success title is an h2.
   */
  variant?: 'inline' | 'dialog';
  onPaymentComplete?: () => void;
  onStateChange?: (state: PaymentPanelState) => void;
}

// ── Presentation helpers ──

const inr = (n: number | string | null | undefined) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const longDate = (d: string | Date) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

const focusSx = { '&:focus-visible, &.Mui-focusVisible': { outline: t.focusOutline, outlineOffset: '2px' } } as const;

/** The standard primary: full width, 56px, gold fill, navy text, label left and icon right. */
const primaryButtonSx = {
  minHeight: 56,
  px: 2.5,
  justifyContent: 'space-between',
  textAlign: 'left',
  borderRadius: `${t.radius}px`,
  bgcolor: t.gold500,
  color: t.navy900,
  fontSize: 16,
  fontWeight: 800,
  textTransform: 'none',
  boxShadow: 'none',
  '&:hover': { bgcolor: t.gold300, boxShadow: 'none' },
  '&.Mui-disabled': { bgcolor: t.gold500, color: t.navy900, opacity: 0.5 },
  '& .MuiButton-endIcon': { ml: 2 },
  ...focusSx,
} as const;

const couponApplySx = {
  minHeight: 48,
  px: '18px',
  flexShrink: 0,
  borderRadius: `${t.radius}px`,
  border: `1px solid ${t.ink}`,
  bgcolor: t.surface,
  color: t.ink,
  fontSize: 15,
  fontWeight: 700,
  textTransform: 'none',
  '&:hover': { bgcolor: t.navy900, color: t.paper, borderColor: t.navy900 },
  '&.Mui-disabled': { bgcolor: t.surface, color: t.inkMuted, borderColor: t.line },
  ...focusSx,
} as const;

/** An inline text link inside a sentence (terms line). */
const inlineLinkSx = {
  p: 0,
  border: 0,
  bgcolor: 'transparent',
  font: 'inherit',
  color: t.ink,
  fontWeight: 600,
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
  cursor: 'pointer',
  '&:hover': { color: t.navy900 },
  ...focusSx,
} as const;

const sectionTitleSx = { m: 0, mb: 1.5, fontSize: 15, fontWeight: 700, color: t.ink } as const;

/** One row of a ruled `<dl>`: dt muted on the left, dd 600 on the right. */
function FeeRow({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 2,
        py: 1.5,
        borderBottom: `1px solid ${t.line}`,
        fontSize: 15,
      }}
    >
      <Box component="dt" sx={{ m: 0, color: t.inkMuted }}>{label}</Box>
      <Box component="dd" sx={{ m: 0, fontWeight: 600, color: t.ink, textAlign: 'right', whiteSpace: 'nowrap' }}>{value}</Box>
    </Box>
  );
}

/** 20px radio circle: 2px border, a 10px navy dot when selected. */
function RadioDot({ selected }: { selected: boolean }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: 20,
        height: 20,
        flexShrink: 0,
        borderRadius: '50%',
        border: `2px solid ${selected ? t.navy900 : t.lineStrong}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {selected && <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: t.navy900 }} />}
    </Box>
  );
}

function MethodRow({
  selected,
  onSelect,
  icon,
  title,
  body,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Box
      component="button"
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.75,
        width: '100%',
        minHeight: 64,
        px: 2,
        py: 1.5,
        borderRadius: `${t.radius}px`,
        border: `2px solid ${selected ? t.navy900 : t.line}`,
        bgcolor: t.surface,
        color: t.ink,
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'border-color 150ms',
        '&:hover': selected ? {} : { borderColor: t.lineStrong },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        ...focusSx,
      }}
    >
      <RadioDot selected={selected} />
      <Box aria-hidden sx={{ display: 'flex', color: t.inkMuted, '& svg': { fontSize: 22 } }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Box component="span" sx={{ display: 'block', fontSize: 15, fontWeight: 700, lineHeight: 1.35 }}>{title}</Box>
        <Box component="span" sx={{ display: 'block', fontSize: 13, lineHeight: 1.45, color: t.inkMuted }}>{body}</Box>
      </Box>
    </Box>
  );
}

interface EnrolledViewProps {
  headingComponent: 'h1' | 'h2';
  firstName: string;
  lead: string;
  receiptNumber?: string | null;
  paymentRef?: string | null;
  course: string;
  date: string;
  total: number;
  steps: string[];
  onGoToApp: () => void;
  receipt?: React.ReactNode;
  refund?: React.ReactNode;
}

/** The enrolled state: navy tile, eyebrow, title, ruled receipt, next steps, actions. */
function EnrolledView({
  headingComponent,
  firstName,
  lead,
  receiptNumber,
  paymentRef,
  course,
  date,
  total,
  steps,
  onGoToApp,
  receipt,
  refund,
}: EnrolledViewProps) {
  const rowSx = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 2,
    py: 1.75,
    borderBottom: `1px solid ${t.line}`,
    fontSize: 15,
  } as const;
  const dtSx = { m: 0, color: t.inkMuted } as const;
  const ddSx = { m: 0, fontWeight: 600, color: t.ink, textAlign: 'right', overflowWrap: 'anywhere' } as const;

  return (
    <Stack spacing={3}>
      <Stack spacing={1.5}>
        <Box sx={{ ...iconTile40Sx, width: 56, height: 56, '& svg': { fontSize: 30 } }} aria-hidden>
          <VerifiedOutlined />
        </Box>
        <Typography
          component="p"
          sx={{
            m: 0,
            fontFamily: t.fontMono,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: t.success,
          }}
        >
          Payment received
        </Typography>
        <Typography
          component={headingComponent}
          sx={{
            m: 0,
            fontSize: 'clamp(2rem, 4.5vw, 3rem)',
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: '-0.01em',
            color: t.ink,
            textWrap: 'balance',
          }}
        >
          {firstName ? `You're enrolled, ${firstName}` : "You're enrolled"}
        </Typography>
        <Typography component="p" sx={{ m: 0, fontSize: 17, lineHeight: 1.55, color: t.inkMuted }}>
          {lead}
        </Typography>
      </Stack>

      <Box component="dl" sx={{ m: 0, ...inkRuleTopSx }}>
        {receiptNumber ? (
          <Box sx={rowSx}>
            <Box component="dt" sx={dtSx}>Receipt</Box>
            <Box component="dd" sx={{ ...ddSx, fontFamily: t.fontMono, fontWeight: 700 }}>{receiptNumber}</Box>
          </Box>
        ) : paymentRef ? (
          <Box sx={rowSx}>
            <Box component="dt" sx={dtSx}>Payment ID</Box>
            <Box component="dd" sx={{ ...ddSx, fontFamily: t.fontMono, fontWeight: 700 }}>{paymentRef}</Box>
          </Box>
        ) : null}
        <Box sx={rowSx}>
          <Box component="dt" sx={dtSx}>Course</Box>
          <Box component="dd" sx={ddSx}>{course}</Box>
        </Box>
        {date && (
          <Box sx={rowSx}>
            <Box component="dt" sx={dtSx}>Date</Box>
            <Box component="dd" sx={ddSx}>{date}</Box>
          </Box>
        )}
        <Box sx={rowSx}>
          <Box component="dt" sx={{ ...dtSx, color: t.ink, fontWeight: 700 }}>Total paid</Box>
          <Box component="dd" sx={{ ...ddSx, fontSize: 18, fontWeight: 800 }}>{inr(total)}</Box>
        </Box>
      </Box>

      <Box>
        <Typography component="h2" sx={{ m: 0, mb: 1.5, fontSize: 17, fontWeight: 700, color: t.ink }}>
          What happens next
        </Typography>
        <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {steps.map((step, i) => (
            <Box component="li" key={step} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <Box
                aria-hidden
                sx={{
                  width: 24,
                  height: 24,
                  flexShrink: 0,
                  borderRadius: '50%',
                  bgcolor: t.navy900,
                  color: t.gold500,
                  fontSize: 12,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {i + 1}
              </Box>
              <Typography component="span" sx={{ fontSize: 15, lineHeight: 1.5, color: t.ink }}>{step}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Stack spacing={1.5}>
        <Button variant="contained" fullWidth onClick={onGoToApp} endIcon={<NorthEastOutlined />} sx={primaryButtonSx}>
          Go to the student app
        </Button>
        {receipt}
        {refund}
      </Stack>
    </Stack>
  );
}

/**
 * The body of the payment experience: fee details, scheme, coupons, the
 * Razorpay checkout and the success state. Rendered inline by the Pay and
 * enrol step and inside PaymentDialog for the returning-user dashboard.
 */
export default function PaymentPanel({
  leadId,
  active = true,
  variant = 'inline',
  onPaymentComplete,
  onStateChange,
}: PaymentPanelProps) {
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
  /** The payments row id of the payment just made, for the refund link. */
  const [paidPaymentId, setPaidPaymentId] = useState<string | null>(null);

  const alreadyPaid = !!details && details.remainingAmount <= 0;
  const enrolled = paymentSuccess || alreadyPaid;

  useEffect(() => {
    onStateChange?.({ paymentSuccess, isProcessing, enrolled });
  }, [paymentSuccess, isProcessing, enrolled, onStateChange]);
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

  const autoAppliedRef = useRef(false);

  const getIdToken = useCallback(async () => {
    try {
      return await (user?.raw as any)?.getIdToken?.();
    } catch {
      return null;
    }
  }, [user]);

  const fetchPaymentDetails = useCallback(async () => {
    if (!leadId || !active) return;
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
  }, [leadId, active, getIdToken, couponApplied]);

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
    if (active && leadId) {
      // Restore persisted choices or reset
      const saved = getSavedChoices(leadId);
      setPaymentSuccess(false);
      setIsProcessing(false);
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
  }, [active, leadId]);

  // Load Razorpay script when dialog opens
  useEffect(() => {
    if (!active) return;
    if (document.querySelector('script[src*="razorpay"]')) return;
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
  }, [active]);

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
        // Razorpay's own checkout accent (passed to their script, not rendered by us): navy900.
        theme: { color: t.navy900 },
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
              setPaidPaymentId(paymentId || null);
              setPaymentSuccess(true);
              if (leadId) clearSavedChoices(leadId);
              // Note: onPaymentComplete is called when user closes the dialog or clicks "Go to the student app"
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
  const headingComponent = variant === 'dialog' ? 'h2' : 'h1';
  const firstName = String(details?.userName || user?.displayName || user?.name || '').trim().split(/\s+/)[0] || '';

  const goToApp = () => {
    onPaymentComplete?.();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';
    window.location.href = `${appUrl}/welcome`;
  };

  // ── Content ──

  const renderContent = () => {
    // Success screen: the payment just went through
    if (paymentSuccess) {
      const paidAt = receiptData?.paidAt || new Date().toISOString();
      const course = receiptData?.courseName || details?.courseName || 'Architecture Course';
      const amount = Number(receiptData?.amount || payableAmount);

      return (
        <EnrolledView
          headingComponent={headingComponent}
          firstName={firstName}
          lead="Welcome to Neram Classes. A confirmation email is on its way to your inbox."
          receiptNumber={receiptData?.receiptNumber}
          paymentRef={receiptData?.razorpayPaymentId}
          course={course}
          date={longDate(paidAt)}
          total={amount}
          steps={[
            'Confirmation email sent to your inbox',
            'Batch allocation within 2 business days',
            'Join WhatsApp group for class updates',
            'Access Neram Nexus online classroom',
          ]}
          onGoToApp={goToApp}
          receipt={
            receiptData && (
              <ReceiptDownload
                receiptData={{
                  receiptNumber: receiptData.receiptNumber || '',
                  amount,
                  razorpayPaymentId: receiptData.razorpayPaymentId,
                  paidAt,
                  courseName: course,
                  paymentScheme: receiptData.paymentScheme,
                }}
                studentName={user?.displayName || user?.name || ''}
                variant="outlined"
                fullWidth
              />
            )
          }
          refund={
            paidPaymentId && leadId ? (
              <RefundRequestButton paymentId={paidPaymentId} paidAt={paidAt} paymentAmount={amount} leadProfileId={leadId} />
            ) : null
          }
        />
      );
    }

    // Loading: skeletons in the shape of the plan cards and the fee summary
    if (loading) {
      return (
        <Stack spacing={2} aria-busy="true" aria-label="Loading payment details">
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 1.5 }}>
            <Skeleton variant="rounded" height={128} sx={{ borderRadius: `${t.radius}px` }} />
            <Skeleton variant="rounded" height={128} sx={{ borderRadius: `${t.radius}px` }} />
          </Box>
          <Skeleton variant="rounded" height={48} sx={{ borderRadius: `${t.radius}px` }} />
          <Skeleton variant="rounded" height={160} sx={{ borderRadius: `${t.radius}px` }} />
          <Skeleton variant="rounded" height={56} sx={{ borderRadius: `${t.radius}px` }} />
        </Stack>
      );
    }

    // Error
    if (error || !details) {
      return (
        <Stack spacing={2}>
          <Box role="alert" sx={{ ...railCardSx(APPLY_ERROR), fontSize: 15, color: t.ink }}>
            {error || 'Failed to load payment details'}
          </Box>
          <Button variant="outlined" onClick={fetchPaymentDetails} fullWidth sx={{ ...outlineButtonSx, minHeight: 48, fontSize: 15 }}>
            Retry
          </Button>
        </Stack>
      );
    }

    // Already paid: the enrolled state from the last payment on record
    if (details.remainingAmount <= 0) {
      const lastPayment = details.payments?.find((p: any) => p.status === 'paid') || details.payments?.[0];
      const paidDate = lastPayment?.paid_at ? longDate(lastPayment.paid_at) : '';
      const receiptNum = lastPayment?.receipt_number;
      const razorpayId = lastPayment?.razorpay_payment_id;

      return (
        <EnrolledView
          headingComponent={headingComponent}
          firstName={firstName}
          lead="Your fees are fully paid. Welcome to Neram Classes."
          receiptNumber={receiptNum}
          paymentRef={razorpayId}
          course={details.courseName}
          date={paidDate}
          total={Number(details.totalPaid)}
          steps={[
            'Complete your profile on the student app',
            'Join WhatsApp group for class updates',
            'Install Microsoft Teams for online classes',
            'Batch allocation within 2 business days',
          ]}
          onGoToApp={goToApp}
          receipt={
            lastPayment && (
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
            )
          }
          refund={
            lastPayment?.id && lastPayment?.paid_at && leadId ? (
              <RefundRequestButton
                paymentId={lastPayment.id}
                paidAt={lastPayment.paid_at}
                paymentAmount={Number(lastPayment.amount || details.totalPaid)}
                leadProfileId={leadId}
              />
            ) : null
          }
        />
      );
    }

    const fullSelected = selectedScheme === 'full';
    const installmentSelected = selectedScheme === 'installment';

    return (
      <Stack spacing={3.5}>
        {/* The dialog has no enrolment row around it, so it names the course here */}
        {variant === 'dialog' && (
          <Box sx={{ ...inkRuleTopSx, pt: 2 }}>
            <Typography component="p" sx={{ m: 0, fontSize: 13, color: t.inkMuted }}>Your enrolment</Typography>
            <Typography component="p" sx={{ m: 0, mt: 0.5, fontSize: 17, fontWeight: 700, color: t.ink }}>
              {details.courseName}
            </Typography>
          </Box>
        )}

        {/* ── Payment plan ── */}
        <Box>
          <Typography component="h2" id="pay-plan-label" sx={sectionTitleSx}>Payment plan</Typography>
          <Box
            role="radiogroup"
            aria-labelledby="pay-plan-label"
            sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 1.5 }}
          >
            <Box
              component="button"
              type="button"
              role="radio"
              aria-checked={fullSelected}
              onClick={() => setSelectedScheme('full')}
              sx={selectedCardSx(fullSelected, {
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '4px',
                width: '100%',
                padding: '16px 18px',
                font: 'inherit',
                cursor: 'pointer',
              })}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, pr: 4 }}>
                <Box component="span" sx={{ fontSize: 16, fontWeight: 700, color: t.ink }}>Pay in full</Box>
                {details.fullPaymentDiscount > 0 && (
                  <Box
                    component="span"
                    sx={{
                      px: '10px',
                      py: '4px',
                      borderRadius: `${t.radiusPill}px`,
                      bgcolor: t.navy900,
                      color: t.gold500,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      lineHeight: 1.2,
                      textTransform: 'uppercase',
                    }}
                  >
                    Best value
                  </Box>
                )}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1, mt: 0.5 }}>
                <Box component="span" sx={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1, color: t.ink }}>
                  {inr(details.fullPaymentAmount)}
                </Box>
                {details.fullPaymentDiscount > 0 && (
                  <Box component="s" sx={{ fontSize: 15, color: t.inkMuted }}>{inr(details.finalFee)}</Box>
                )}
              </Box>
              {details.fullPaymentDiscount > 0 && (
                <Box component="span" sx={{ fontSize: 14, fontWeight: 700, color: t.gold800 }}>
                  You save {inr(details.fullPaymentDiscount)}
                </Box>
              )}
              {fullSelected && (
                <CheckCircleOutlined aria-hidden sx={{ position: 'absolute', top: 14, right: 14, fontSize: 22, color: t.navy900 }} />
              )}
            </Box>

            {showInstallmentOption && (
              <Box
                component="button"
                type="button"
                role="radio"
                aria-checked={installmentSelected}
                onClick={() => setSelectedScheme('installment')}
                sx={selectedCardSx(installmentSelected, {
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '4px',
                  width: '100%',
                  padding: '16px 18px',
                  font: 'inherit',
                  cursor: 'pointer',
                })}
              >
                <Box component="span" sx={{ fontSize: 16, fontWeight: 700, color: t.ink, pr: 4 }}>2 interest-free parts</Box>
                <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1, mt: 0.5 }}>
                  <Box component="span" sx={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1, color: t.ink }}>
                    {inr(details.installment1Amount)}
                  </Box>
                  <Box component="span" sx={{ fontSize: 15, color: t.inkMuted }}>now</Box>
                </Box>
                <Box component="span" sx={{ fontSize: 14, color: t.inkMuted }}>
                  + {inr(details.installment2Amount)} in {details.installment2DueDays} days
                </Box>
                {installmentSelected && (
                  <CheckCircleOutlined aria-hidden sx={{ position: 'absolute', top: 14, right: 14, fontSize: 22, color: t.navy900 }} />
                )}
              </Box>
            )}
          </Box>

          {/* Nudge for installment users */}
          {installmentSelected && details.fullPaymentDiscount > 0 && (
            <Typography component="p" sx={{ m: 0, mt: 1.5, fontSize: 14, color: t.inkMuted }}>
              Pay in full instead and save{' '}
              <Box component="strong" sx={{ color: t.gold800, fontWeight: 700 }}>{inr(details.fullPaymentDiscount)}</Box>.
            </Typography>
          )}
        </Box>

        {/* ── Coupon code ── */}
        <Box>
          <Box
            component="label"
            htmlFor="pay-coupon-code"
            sx={{ display: 'block', mb: 1, fontSize: 15, fontWeight: 600, color: t.ink }}
          >
            Have a coupon code?
          </Box>
          {details.hasCoupon && !couponApplied && (
            <Typography component="p" sx={{ m: 0, mb: 1, fontSize: 13, lineHeight: 1.45, color: t.inkMuted }}>
              A special coupon has been generated for you. Apply it below.
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <TextField
              id="pay-coupon-code"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="Enter code"
              disabled={couponApplied || couponLoading}
              error={!!couponError}
              helperText={couponError}
              inputProps={{ autoCapitalize: 'characters', autoComplete: 'off', spellCheck: false }}
              sx={{ flex: 1, minWidth: 0, '& input:not(:placeholder-shown)': { textTransform: 'uppercase' } }}
            />
            <Button
              variant="outlined"
              onClick={handleApplyCoupon}
              disabled={!couponCode || couponApplied || couponLoading}
              aria-busy={couponLoading || undefined}
              sx={couponApplySx}
            >
              {couponLoading ? <CircularProgress size={18} color="inherit" aria-label="Applying coupon" /> : 'Apply'}
            </Button>
          </Box>
          {couponApplied && (
            <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.25 }}>
              <CheckCircleOutlined aria-hidden sx={{ color: t.success, fontSize: 18 }} />
              <Typography component="span" sx={{ fontSize: 14, fontWeight: 700, color: t.success }}>
                Coupon applied. You save {inr(couponDiscount)}.
              </Typography>
            </Box>
          )}
        </Box>

        {/* ── YouTube subscribe and save ── */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 1.75,
            px: 2.5,
            py: 2,
            bgcolor: t.surface,
            border: `1px solid ${t.line}`,
            borderRadius: `${t.radius}px`,
          }}
        >
          <Box sx={iconTile40Sx} aria-hidden>
            <SmartDisplayOutlined />
          </Box>
          <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
            <Typography component="p" sx={{ m: 0, fontSize: 15, fontWeight: 700, color: t.ink }}>
              Subscribe on YouTube and save ₹50
            </Typography>
            <Typography
              component="p"
              role={youtubeCouponApplied ? 'status' : undefined}
              sx={{ m: 0, mt: 0.25, fontSize: 13, lineHeight: 1.45, color: youtubeCouponApplied ? t.success : t.inkMuted, fontWeight: youtubeCouponApplied ? 700 : 400 }}
            >
              {youtubeCouponApplied
                ? `YouTube discount applied. You save ${inr(youtubeDiscount || 50)}.`
                : 'Subscribe to our YouTube channel for an instant ₹50 discount.'}
            </Typography>
          </Box>
          {!youtubeCouponApplied && (
            <Button variant="outlined" onClick={handleYouTubeSubscribe} sx={outlineButtonSx}>
              Subscribe
            </Button>
          )}
        </Box>

        {/* ── Fee summary ── */}
        <Box>
          <Typography component="h2" sx={sectionTitleSx}>Fee summary</Typography>
          <Box component="dl" sx={{ m: 0, ...inkRuleTopSx }}>
            <FeeRow label="Course fee" value={inr(details.baseFee)} />
            {details.scholarshipDiscount > 0 && (
              <FeeRow label="Scholarship discount" value={`− ${inr(details.scholarshipDiscount)}`} />
            )}
            {fullSelected && details.fullPaymentDiscount > 0 && (
              <FeeRow label="Full payment discount" value={`− ${inr(details.fullPaymentDiscount)}`} />
            )}
            {couponApplied && couponDiscount > 0 && <FeeRow label="Coupon discount" value={`− ${inr(couponDiscount)}`} />}
            {youtubeCouponApplied && youtubeDiscount > 0 && (
              <FeeRow label="YouTube subscriber discount" value={`− ${inr(youtubeDiscount)}`} />
            )}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2, py: 2 }}>
              <Box component="dt" sx={{ m: 0, fontSize: 16, fontWeight: 700, color: t.ink }}>
                {installmentSelected ? 'Pay now (first part)' : 'Amount to pay'}
              </Box>
              <Box component="dd" sx={{ m: 0, fontSize: 24, fontWeight: 800, color: t.ink, whiteSpace: 'nowrap' }}>
                {inr(payableAmount)}
              </Box>
            </Box>
          </Box>
          {installmentSelected && (
            <Typography component="p" sx={{ m: 0, fontSize: 13, lineHeight: 1.45, color: t.inkMuted }}>
              Second part of {inr(details.installment2Amount)} is due in {details.installment2DueDays} days.
            </Typography>
          )}
        </Box>

        {/* ── Payment method ── */}
        <Box>
          <Typography component="h2" id="pay-method-label" sx={sectionTitleSx}>Payment method</Typography>
          <Stack spacing={1} role="radiogroup" aria-labelledby="pay-method-label">
            <MethodRow
              selected={paymentMethod === 'razorpay'}
              onSelect={() => setPaymentMethod('razorpay')}
              icon={<CreditCardOutlined />}
              title="Pay online"
              body="UPI, credit or debit card, net banking"
            />
            <MethodRow
              selected={paymentMethod === 'direct'}
              onSelect={() => setPaymentMethod('direct')}
              icon={<AccountBalanceOutlined />}
              title="Direct UPI or bank transfer"
              body="Pay directly and send us the screenshot"
            />
          </Stack>

          {paymentMethod === 'direct' && (
            <Box
              sx={{
                mt: 1.5,
                px: 2.25,
                py: 1.75,
                bgcolor: t.ground,
                border: `1px solid ${t.line}`,
                borderRadius: `${t.radius}px`,
                fontSize: 14,
                lineHeight: 1.6,
                color: t.ink,
              }}
            >
              <Box component="p" sx={{ m: 0, fontWeight: 700 }}>UPI ID: neramclasses@upi</Box>
              <Box component="p" sx={{ m: 0 }}>Bank: HDFC Bank, A/C 50200012345678, IFSC HDFC0001234</Box>
              <Box component="p" sx={{ m: 0, mt: 1 }}>
                Transfer <strong>{inr(payableAmount)}</strong>, then contact support with the screenshot.
              </Box>
            </Box>
          )}
        </Box>

        {/* Payment deadline */}
        {details.paymentDeadline && (
          <Box sx={{ ...railCardSx(t.statusDraft), fontSize: 14, color: t.ink }}>
            Payment deadline: <strong>{longDate(details.paymentDeadline)}</strong>
          </Box>
        )}

        {/* Error display */}
        {error && (
          <Box role="alert" sx={{ ...railCardSx(APPLY_ERROR), fontSize: 14, color: t.ink }}>
            {error}
          </Box>
        )}

        {/* ── Pay button ── */}
        <Stack spacing={1.25}>
          <Button
            fullWidth
            variant="contained"
            onClick={paymentMethod === 'razorpay' ? handleRazorpayPayment : undefined}
            disabled={isProcessing || paymentMethod === 'direct'}
            endIcon={isProcessing ? <CircularProgress size={20} color="inherit" aria-hidden /> : <LockOutlined />}
            sx={primaryButtonSx}
          >
            {isProcessing
              ? 'Processing'
              : paymentMethod === 'razorpay'
                ? `Pay ${inr(payableAmount)}`
                : 'Contact support to confirm a transfer'}
          </Button>

          <Typography component="p" sx={{ m: 0, fontSize: 13, lineHeight: 1.45, color: t.inkMuted, textAlign: 'center' }}>
            By proceeding, you agree to our{' '}
            <Box component="button" type="button" onClick={() => { setLegalDrawerTab(0); setLegalDrawerOpen(true); }} sx={inlineLinkSx}>
              Terms and Conditions
            </Box>{' '}
            and{' '}
            <Box component="button" type="button" onClick={() => { setLegalDrawerTab(1); setLegalDrawerOpen(true); }} sx={inlineLinkSx}>
              Refund Policy
            </Box>
            .
          </Typography>
        </Stack>
      </Stack>
    );
  };

  return (
    <>
      {renderContent()}
      <YouTubeSubscribeModal
        open={youtubeModalOpen}
        onClose={() => setYoutubeModalOpen(false)}
        onSuccess={handleYouTubeSuccess}
      />
      <LegalDrawer open={legalDrawerOpen} onClose={() => setLegalDrawerOpen(false)} initialTab={legalDrawerTab} />
    </>
  );
}
