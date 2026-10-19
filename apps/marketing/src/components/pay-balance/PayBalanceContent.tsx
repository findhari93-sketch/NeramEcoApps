'use client';

import { useCallback, useEffect, useState } from 'react';
import { Box, Container, Typography, Alert, Skeleton, LoginModal } from '@neram/ui';
import { useFirebaseAuth, getCurrentUser } from '@neram/auth';
import Google from '@mui/icons-material/Google';
import PhoneIphoneOutlined from '@mui/icons-material/PhoneIphoneOutlined';
import TaskAltOutlined from '@mui/icons-material/TaskAltOutlined';
import { tokens as t, CtaButton } from '@/design-system';
import PayStep from '@/components/enroll/PayStep';
import PaymentSubmittedScreen from '@/components/enroll/PaymentSubmittedScreen';
import { rupees, formatDay, istTodayKey, type PaymentPayee } from '@/components/enroll/student-pay-types';
import type { PaymentDetailsData } from '@/components/apply/types';

/** The app hosts register-user and verify-phone for every site. */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';

interface Claim {
  id: string;
  status: 'pending' | 'verified' | 'rejected';
  amount: number;
  method: 'upi_direct' | 'bank_transfer';
  utrTail: string | null;
  paidOn: string | null;
  submittedAt: string;
  rejectionReason: string | null;
}

interface BalanceData {
  studentName: string | null;
  isStudent: boolean;
  due: {
    amount: number | null;
    installmentNumber: number | null;
    dueDate: string | null;
    agreed: number | null;
    paidTotal: number;
    balance: number | null;
  };
  payee: PaymentPayee;
  paymentNote: string;
  pending: Claim | null;
  lastRejection: Claim | null;
}

const EMPTY_PAYMENT: PaymentDetailsData = {
  paymentDate: istTodayKey(),
  paymentType: 'installment',
  installmentNumber: 2,
  paymentMethod: 'upi_direct',
  transactionReference: '',
  paymentProofUrl: null,
  paymentProofFileName: null,
};

/**
 * /en/pay-balance: an enrolled student pays what is next due (the second
 * installment, or the balance) to the trust. Sign in, see the amount, pay,
 * send the reference. Staff verify it in Admin > Collections.
 */
export default function PayBalanceContent() {
  const { user, loading: authLoading, signInWithGoogle } = useFirebaseAuth();
  const [showSignIn, setShowSignIn] = useState(false);
  const [data, setData] = useState<BalanceData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentDetailsData>(EMPTY_PAYMENT);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ claim: Claim; utr: string; emailedTo: string | null } | null>(null);

  const authHeaders = async (): Promise<Record<string, string>> => {
    const idToken = await getCurrentUser()?.getIdToken();
    return idToken ? { Authorization: `Bearer ${idToken}` } : {};
  };

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/pay-balance', { headers: await authHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load your fee.');
      setData(json.data);
    } catch (err: any) {
      setLoadError(err?.message || 'Could not load your fee.');
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const updatePayment = (d: Partial<PaymentDetailsData>) => {
    setPayment((prev) => ({ ...prev, ...d }));
    const keys = Object.keys(d);
    if (keys.some((k) => fieldErrors[k])) {
      setFieldErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !keys.includes(k))));
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/pay-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          paymentMethod: payment.paymentMethod,
          transactionReference: payment.transactionReference,
          paymentDate: payment.paymentDate,
          paymentProofUrl: payment.paymentProofUrl,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFieldErrors(json.fieldErrors || {});
        if (json.code === 'CLAIM_PENDING' || json.code === 'NOTHING_DUE') await load();
        throw new Error(json.error || 'Could not send your payment details.');
      }
      setSubmitted({ claim: json.data.pending, utr: json.data.utr, emailedTo: json.data.emailedTo });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setSubmitError(err?.message || 'Could not send your payment details.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Signed out ─────────────────────────────────────────────────────────────
  if (!authLoading && !user) {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 3, md: 6 }, px: 2 }}>
        <Box sx={{ p: { xs: 2.5, md: 4 }, border: `1px solid ${t.line}`, borderRadius: `${t.radius}px`, bgcolor: t.surface }}>
          <Typography component="h1" sx={{ fontSize: { xs: 24, md: 28 }, fontWeight: 800, color: t.ink, mb: 1 }}>
            Pay your balance
          </Typography>
          <Typography sx={{ fontSize: 16, color: t.inkMuted, mb: 3, lineHeight: 1.5 }}>
            Sign in with the phone number on your Neram account. We will show exactly what is due.
          </Typography>
          <CtaButton variant="primary" fullWidth size="lg" onClick={() => setShowSignIn(true)} startIcon={<PhoneIphoneOutlined />} endIcon={null}>
            Sign in with phone number
          </CtaButton>
          <Box sx={{ mt: 1.5 }}>
            <CtaButton variant="outline" fullWidth onClick={signInWithGoogle} startIcon={<Google />} endIcon={null}>
              Sign in with Google
            </CtaButton>
          </Box>
        </Box>
        {showSignIn && (
          <LoginModal open={showSignIn} onClose={() => setShowSignIn(false)} phoneOnly apiBaseUrl={APP_URL} onAuthenticated={() => setShowSignIn(false)} />
        )}
      </Container>
    );
  }

  // ── Just submitted, or a payment already waiting ──────────────────────────
  const waiting = submitted?.claim || data?.pending;
  if (waiting) {
    return (
      <PaymentSubmittedScreen
        studentName={data?.studentName || null}
        submission={{
          amount: waiting.amount,
          scheme: 'installment',
          method: waiting.method,
          utr: submitted?.utr || null,
          utrTail: waiting.utrTail,
          paidOn: waiting.paidOn,
          balance: null,
          balanceDueDate: null,
          emailedTo: submitted?.emailedTo || null,
        }}
        planLabel="Balance payment"
        doneLabel="Payment recorded"
        doneNote="You get a receipt by email, and your fee page shows it as paid."
      />
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!data && !loadError) {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 3, md: 6 }, px: 2 }} aria-busy="true" aria-label="Loading your fee">
        <Skeleton variant="text" width="60%" height={40} />
        <Skeleton variant="rounded" height={120} sx={{ mt: 2 }} />
        <Skeleton variant="rounded" height={320} sx={{ mt: 2 }} />
      </Container>
    );
  }

  if (loadError || !data) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, px: 2 }}>
        <Alert severity="error" action={<CtaButton variant="link" onClick={load} endIcon={null}>Try again</CtaButton>}>
          {loadError}
        </Alert>
      </Container>
    );
  }

  const { due } = data;
  const first = (data.studentName || '').trim().split(/\s+/)[0];

  // ── Nothing due ────────────────────────────────────────────────────────────
  if (!data.isStudent || due.amount === null) {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 4, md: 8 }, px: 2, textAlign: 'center' }}>
        <TaskAltOutlined aria-hidden sx={{ fontSize: 56, color: t.success, mb: 1.5 }} />
        <Typography component="h1" sx={{ fontSize: { xs: 24, md: 28 }, fontWeight: 800, color: t.ink }}>
          {data.isStudent ? 'Nothing to pay right now' : 'No fee found on this account'}
        </Typography>
        <Typography sx={{ fontSize: 16, color: t.inkMuted, mt: 1, lineHeight: 1.5 }}>
          {data.isStudent
            ? due.agreed
              ? `Your fee of ${rupees(due.agreed)} is fully paid. Thank you.`
              : 'There is no balance on your account.'
            : 'Signed in with a different number? Sign out and use the number you enrolled with, or message us on WhatsApp.'}
        </Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 2.5, md: 5 }, px: 2 }}>
      <Typography component="h1" sx={{ fontSize: { xs: 24, md: 28 }, fontWeight: 800, color: t.ink }}>
        {first ? `Hi ${first}, pay your balance` : 'Pay your balance'}
      </Typography>
      <Typography sx={{ fontSize: 16, color: t.inkMuted, mt: 0.5, mb: 2.5, lineHeight: 1.5 }}>
        Pay the trust directly, then send us the reference. It takes about 2 minutes.
      </Typography>

      {data.lastRejection && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          We could not confirm your last payment ({rupees(data.lastRejection.amount)}): {data.lastRejection.rejectionReason} Please check the reference and submit again.
        </Alert>
      )}

      <Box sx={{ border: `1px solid ${t.line}`, borderRadius: `${t.radius}px`, bgcolor: t.surface, px: 2, py: 1, mb: 3 }}>
        {[
          ['Course fee', due.agreed !== null ? rupees(due.agreed) : '-'],
          ['Paid so far', rupees(due.paidTotal)],
          ['Balance', due.balance !== null ? rupees(due.balance) : '-'],
          ...(due.dueDate ? [['Due by', formatDay(due.dueDate)]] : []),
        ].map(([label, value]) => (
          <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 1, borderBottom: `1px solid ${t.line}`, '&:last-of-type': { borderBottom: 'none' } }}>
            <Typography sx={{ fontSize: 15, color: t.inkMuted }}>{label}</Typography>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: t.ink }}>{value}</Typography>
          </Box>
        ))}
      </Box>

      {submitError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSubmitError(null)}>
          {submitError}
        </Alert>
      )}

      <PayStep
        amount={due.amount}
        scheme="installment"
        balance={null}
        balanceDueDate={null}
        amountNote={
          due.balance !== null && due.balance - due.amount > 0.01
            ? `${due.installmentNumber ? `Installment ${due.installmentNumber}. ` : ''}${rupees(due.balance - due.amount)} more after this.`
            : 'This clears your fee. Nothing more to pay after this.'
        }
        payee={data.payee}
        paymentNote={data.paymentNote}
        token="balance"
        payment={payment}
        updatePayment={updatePayment}
        termsAccepted
        setTermsAccepted={() => {}}
        showTerms={false}
        phoneVerified
        onSubmit={submit}
        submitting={submitting}
        fieldErrors={fieldErrors}
      />
    </Container>
  );
}
