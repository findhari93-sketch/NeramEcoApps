'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, Skeleton, Typography } from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import { trackApplicationSubmitted } from '@neram/ui/analytics';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import SmartphoneOutlinedIcon from '@mui/icons-material/SmartphoneOutlined';
import { applicationGaps, applicationSummary, draftToSubmitBody, type ApplicationRow } from '@/lib/aintra/application';
import { leadAttribution } from '@/lib/attribution';
import { trackTaxonomyEvent } from '@/lib/funnel-tracker';
import { ensureAccount, type EnsuredAccount } from '@/lib/ensure-account';
import { currentIdToken } from '@/components/demo-class/demo-client';
import { BookingCardFrame, SummaryList, useAintraBooking } from './BookingContext';

const LoginModal = dynamic(() => import('@neram/ui').then((m) => m.LoginModal), { ssr: false });
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';

type Loaded = { draft: ApplicationRow | null; submitted: ApplicationRow | null; programmeLabel: string | null };

const STATUS_TEXT: Record<string, string> = {
  pending_verification: 'waiting for phone verification',
  submitted: 'submitted, our team is reviewing it',
  under_review: 'our team is reviewing it',
  approved: 'approved, the next step is paying the fee',
  partial_payment: 'enrolled, part of the fee paid',
  enrolled: 'enrolled',
  rejected: 'not accepted',
};

const buttonSx = { minHeight: 48, fontWeight: 800, textTransform: 'none', fontSize: '1rem' } as const;

async function loadApplications(): Promise<Loaded> {
  const token = await currentIdToken();
  const [apps, fees] = await Promise.all([
    token
      ? fetch('/api/application', { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json())
          .catch(() => ({}))
      : Promise.resolve({}),
    fetch('/api/fee-structures?excludeHidden=true')
      .then((r) => r.json())
      .catch(() => ({})),
  ]);
  const list: ApplicationRow[] = Array.isArray(apps?.data) ? apps.data : [];
  const draft = list.find((a) => a.status === 'draft') ?? null;
  const submitted = list.find((a) => a.status && a.status !== 'draft' && a.status !== 'deleted') ?? null;
  const programme = Array.isArray(fees?.feeStructures)
    ? fees.feeStructures.find((f: { id: string }) => f.id === draft?.fee_structure_id)
    : null;
  return { draft, submitted, programmeLabel: programme?.display_name ?? null };
}

/**
 * The application Aintra filled in with the student (2026-10-20). It shows
 * what is saved; when nothing is missing the student ticks the terms and taps
 * Submit, which posts the draft to /api/application exactly as the form's
 * Review step does (the route checks the verified phone itself).
 */
export default function ApplicationCard() {
  const ctx = useAintraBooking();
  const { user, loading: authLoading } = useFirebaseAuth();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [account, setAccount] = useState<EnsuredAccount | null>(null);
  const [terms, setTerms] = useState(false);
  const [phoneDialog, setPhoneDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: string | null } | null>(null);

  const refresh = useCallback(async (force = false) => {
    const [apps, acc] = await Promise.all([loadApplications(), ensureAccount({ force })]);
    setLoaded(apps);
    setAccount(acc);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoaded({ draft: null, submitted: null, programmeLabel: null });
      return;
    }
    setLoaded(null);
    void refresh();
  }, [user, authLoading, refresh]);

  const submit = async () => {
    const draft = loaded?.draft;
    if (!draft || !terms) return;
    setBusy(true);
    setError(null);
    try {
      const token = await currentIdToken();
      if (!token) {
        ctx?.openSignIn();
        return;
      }
      // The route accepts only the account's OTP-verified number, so send that one.
      const body = {
        ...draftToSubmitBody(draft),
        ...(account?.phone_verified && account.phone ? { phone: account.phone } : {}),
        ...leadAttribution(),
      };
      const res = await fetch('/api/application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        if (/phone verification/i.test(data?.error || '')) setPhoneDialog(true);
        throw new Error(data?.error || 'Could not submit your application. Please try again.');
      }
      const id = data.data?.id as string | undefined;
      trackTaxonomyEvent('application_completed', { application_id: id, from: 'aintra' });
      if (data.applicationConversion && id) {
        trackApplicationSubmitted({ applicationId: id, phone: account?.phone ?? null, email: account?.email ?? undefined });
      }
      setDone({ number: data.data?.application_number ?? null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit your application. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || !loaded) {
    return (
      <Box aria-busy aria-label="Loading your application" sx={{ display: 'grid', gap: 1 }}>
        <Skeleton variant="text" width="55%" height={28} />
        <Skeleton variant="rounded" height={120} />
        <Skeleton variant="rounded" height={48} />
      </Box>
    );
  }

  if (done) {
    return (
      <BookingCardFrame icon={<CheckCircleRoundedIcon />} title="Application submitted" labelledBy="aintra-apply-done">
        <Typography role="status" sx={{ fontSize: '1rem', lineHeight: 1.5 }}>
          {done.number ? `Your application number is ${done.number}. ` : ''}
          {account?.email ? 'A copy is on its way to your email. ' : ''}Our team will be in touch about the next step.
        </Typography>
        <Button href={`${APP_URL}/my-applications`} variant="outlined" sx={{ alignSelf: 'flex-start', minHeight: 48, textTransform: 'none', fontWeight: 700 }}>
          View my application
        </Button>
      </BookingCardFrame>
    );
  }

  if (!user) {
    return (
      <BookingCardFrame icon={<AssignmentOutlinedIcon />} title="Sign in to start your application" labelledBy="aintra-apply-signin">
        <Typography sx={{ fontSize: '1rem', lineHeight: 1.5 }}>
          Once you are signed in, I fill in the form with you right here, a question or two at a time. It takes about five minutes.
        </Typography>
        <Button variant="contained" disableElevation fullWidth onClick={() => ctx?.openSignIn()} startIcon={<LoginRoundedIcon />} sx={buttonSx}>
          Sign in
        </Button>
      </BookingCardFrame>
    );
  }

  const { draft, submitted, programmeLabel } = loaded;

  if (!draft && submitted) {
    return (
      <BookingCardFrame icon={<CheckCircleRoundedIcon />} title="You have already applied" labelledBy="aintra-apply-existing">
        <Typography sx={{ fontSize: '1rem', lineHeight: 1.5 }}>
          {submitted.application_number ? `Application ${submitted.application_number}: ` : 'Your application: '}
          {STATUS_TEXT[submitted.status ?? ''] ?? submitted.status}.
        </Typography>
        <Button href={`${APP_URL}/my-applications`} variant="outlined" sx={{ alignSelf: 'flex-start', minHeight: 48, textTransform: 'none', fontWeight: 700 }}>
          View my application
        </Button>
      </BookingCardFrame>
    );
  }

  const fullForm = (
    <Button component={Link} href="/apply" sx={{ alignSelf: 'flex-start', minHeight: 48, textTransform: 'none', fontWeight: 700 }}>
      Finish on the full form instead
    </Button>
  );

  if (!draft) {
    return (
      <BookingCardFrame icon={<AssignmentOutlinedIcon />} title="Your application" labelledBy="aintra-apply-empty">
        <Typography sx={{ fontSize: '1rem', lineHeight: 1.5 }}>
          You are signed in. Tell me the student&apos;s name to begin, and I will ask the rest one step at a time.
        </Typography>
        {fullForm}
      </BookingCardFrame>
    );
  }

  const gaps = applicationGaps(draft);
  const rows = applicationSummary(draft, programmeLabel);

  if (gaps.length) {
    return (
      <BookingCardFrame icon={<AssignmentOutlinedIcon />} title="Your application so far" labelledBy="aintra-apply-progress">
        {rows.length > 0 && <SummaryList rows={rows} />}
        <Typography sx={{ fontSize: '1rem', lineHeight: 1.5 }}>
          <b>Still needed:</b> {gaps.join(', ')}. Answer here and I will save each one.
        </Typography>
        {fullForm}
      </BookingCardFrame>
    );
  }

  const phoneVerified = !!account?.phone_verified;

  return (
    <BookingCardFrame icon={<AssignmentOutlinedIcon />} title="Check and submit your application" labelledBy="aintra-apply-title">
      <SummaryList rows={rows} />
      <Button component={Link} href="/apply" sx={{ alignSelf: 'flex-start', minHeight: 48, textTransform: 'none', fontWeight: 700 }}>
        Change something on the full form
      </Button>
      <FormControlLabel
        sx={{ alignItems: 'flex-start', m: 0, gap: 1 }}
        control={<Checkbox checked={terms} onChange={(e) => setTerms(e.target.checked)} sx={{ p: 1, mt: -0.5 }} />}
        label={
          <Typography component="span" sx={{ fontSize: '0.9375rem', lineHeight: 1.5 }}>
            I agree to the{' '}
            <Box component={Link} href="/terms" target="_blank" sx={{ color: 'primary.main', fontWeight: 700 }}>
              Terms
            </Box>{' '}
            and the{' '}
            <Box component={Link} href="/refund-policy" target="_blank" sx={{ color: 'primary.main', fontWeight: 700 }}>
              Refund policy
            </Box>
            .
          </Typography>
        }
      />
      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}
      {phoneVerified ? (
        <Button
          variant="contained"
          disableElevation
          fullWidth
          onClick={submit}
          disabled={busy || !terms}
          startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
          sx={buttonSx}
        >
          {busy ? 'Submitting' : 'Submit application'}
        </Button>
      ) : (
        <Button variant="contained" disableElevation fullWidth onClick={() => setPhoneDialog(true)} startIcon={<SmartphoneOutlinedIcon />} sx={buttonSx}>
          Verify your phone to submit
        </Button>
      )}
      <Typography variant="caption" color="text.secondary">
        {terms ? 'Nothing is paid here.' : 'Tick the box above to submit.'}
      </Typography>

      {phoneDialog && (
        <LoginModal
          open={phoneDialog}
          onClose={() => setPhoneDialog(false)}
          allowClose
          phoneOnly
          initialPhone={account?.phone || ''}
          apiBaseUrl={APP_URL}
          // Above the chat drawer (1450) and its menus (1460).
          zIndex={1500}
          onAuthenticated={async () => {
            setPhoneDialog(false);
            await refresh(true);
          }}
        />
      )}
    </BookingCardFrame>
  );
}
