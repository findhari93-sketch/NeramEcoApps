'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  Collapse,
  FormControlLabel,
  LoginModal,
  Paper,
  Skeleton,
  Switch,
  TextField,
  Typography,
} from '@neram/ui';
import ButtonBase from '@mui/material/ButtonBase';
import { useFirebaseAuth } from '@neram/auth';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import NightsStayOutlinedIcon from '@mui/icons-material/NightsStayOutlined';
import PhoneInTalkOutlinedIcon from '@mui/icons-material/PhoneInTalkOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import SmartphoneOutlinedIcon from '@mui/icons-material/SmartphoneOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ShareIcon from '@mui/icons-material/Share';
import {
  availableDemoDays,
  formatDemoPreference,
  formatWindowRange,
  resolveDemoSchedule,
  DEFAULT_DEMO_SCHEDULE,
  type DemoScheduleSettings,
  type DemoWindow,
  type DemoWindowId,
} from '@neram/database/demo-schedule';
import { touchAttribution } from '@/lib/attribution';
import { trackTaxonomyEvent } from '@/lib/funnel-tracker';
import { ensureAccount, type EnsuredAccount } from '@/lib/ensure-account';
import { writeDemoActive } from '@/lib/demo-cta';
import GoogleCard from '@/components/apply/fields/GoogleCard';
import OrDivider from '@/components/apply/fields/OrDivider';
import type { PublicDemoRequest } from '@/lib/demo-request';
import DemoStatusCard, { type DemoPublicSettings } from './DemoStatusCard';
import {
  EMPTY_DRAFT,
  applyDraftPrefill,
  clearDraft,
  fetchMyDemo,
  fireDemoConversion,
  hasApplyDraft,
  loadDraft,
  saveDraft,
  submitDemoRequest,
  type DemoDraft,
} from './demo-client';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';

const WINDOW_ICON: Record<DemoWindowId, typeof WbSunnyOutlinedIcon> = {
  morning: WbSunnyOutlinedIcon,
  afternoon: LightModeOutlinedIcon,
  evening: NightsStayOutlinedIcon,
};

const CLASSES = [
  { v: '10th', l: 'Class 10' },
  { v: '11th', l: 'Class 11' },
  { v: '12th', l: 'Class 12' },
  { v: '12th-pass', l: 'Drop year' },
  { v: 'other', l: 'Other' },
];

const LANGUAGES = [
  { v: 'en', l: 'English' },
  { v: 'ta', l: 'Tamil' },
  { v: 'hi', l: 'Hindi' },
  { v: 'kn', l: 'Kannada' },
  { v: 'ml', l: 'Malayalam' },
  { v: 'te', l: 'Telugu' },
];

const STEP_TITLES = ['When suits you?', 'Who is joining?'];

/**
 * Where the visitor came from (`?from=`), stored as the lead's page code
 * (two letters, a dash, three letters) so staff can see which door works.
 */
const FROM_PAGE_CODE: Record<string, string> = {
  apply: 'DC-APL',
  apply_help: 'DC-APH',
  apply_exit: 'DC-APX',
  apply_nudge: 'DC-WAN',
};

/** "+91 98xxx xx210": enough to recognise the number, not enough to copy it. */
function maskPhone(phone: string | null | undefined): string {
  const d = (phone || '').replace(/\D/g, '').slice(-10);
  if (d.length !== 10) return phone || '';
  return `+91 ${d.slice(0, 2)}xxx xx${d.slice(7)}`;
}

const focusRing = { '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 } };

/** A selectable pill: 48px tall, text plus a tick, never colour alone. */
function Pill({
  selected,
  onClick,
  children,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <ButtonBase
      onClick={onClick}
      aria-pressed={selected}
      aria-label={label}
      sx={{
        minHeight: 48,
        px: 2,
        borderRadius: 999,
        border: 2,
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'primary.main' : 'background.paper',
        color: selected ? 'primary.contrastText' : 'text.primary',
        fontFamily: 'inherit',
        fontWeight: 600,
        fontSize: '0.95rem',
        gap: 0.75,
        transition: 'background-color 150ms, border-color 150ms',
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        ...focusRing,
      }}
    >
      {selected && <CheckCircleIcon aria-hidden sx={{ fontSize: 18 }} />}
      {children}
    </ButtonBase>
  );
}

export default function DemoBookingCard() {
  const { user, loading: authLoading } = useFirebaseAuth();
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [schedule, setSchedule] = useState<DemoScheduleSettings>(DEFAULT_DEMO_SCHEDULE);
  const [publicSettings, setPublicSettings] = useState<DemoPublicSettings>({
    schedule: DEFAULT_DEMO_SCHEDULE,
    drawingWhatsApp: '919176137043',
    callbackPromise: 'within 2 working hours',
  });
  const [draft, setDraft] = useState<DemoDraft>(EMPTY_DRAFT);
  const [existing, setExisting] = useState<PublicDemoRequest | null>(null);
  const [checkedExisting, setCheckedExisting] = useState(false);
  const [booked, setBooked] = useState<PublicDemoRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The OTP dialog: on its own it signs a visitor in by phone, after Google it
  // adds the phone to that account.
  const [phoneDialog, setPhoneDialog] = useState(false);
  const [account, setAccount] = useState<EnsuredAccount | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [applyDraftExists, setApplyDraftExists] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const accountSeq = useRef(0);
  const autoPromptedRef = useRef(false);

  // Days depend on "now", so they are computed only in the browser.
  useEffect(() => {
    setMounted(true);
    setNow(new Date());
    const saved = loadDraft();
    const source = new URLSearchParams(window.location.search).get('from');
    setFrom(source && FROM_PAGE_CODE[source] ? source : null);
    setApplyDraftExists(hasApplyDraft());
    // Left the application to book a demo: carry over what the form knows.
    const carried = source?.startsWith('apply') ? applyDraftPrefill() : { name: '', currentClass: '' };
    const base = saved ?? EMPTY_DRAFT;
    if (saved || carried.name || carried.currentClass) {
      setDraft({ ...base, name: base.name || carried.name, currentClass: base.currentClass || carried.currentClass });
    }
    fetch('/api/demo-class/settings', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.settings) return;
        setSchedule(resolveDemoSchedule(d.settings.schedule ?? d.settings));
        setPublicSettings({
          schedule: d.settings.schedule ?? DEFAULT_DEMO_SCHEDULE,
          drawingWhatsApp: d.settings.drawingWhatsApp || '919176137043',
          callbackPromise: d.settings.callbackPromise || 'within 2 working hours',
        });
      })
      .catch(() => {});
  }, []);

  /**
   * Load the account behind the signed-in user (name, verified phone). Each
   * call outdates the ones before it, so a slow cached answer from before the
   * OTP can never overwrite the fresh "verified" one.
   */
  const loadAccount = useCallback(async (force = false) => {
    const seq = ++accountSeq.current;
    setAccountLoading(true);
    const acc = await ensureAccount({ force });
    if (seq !== accountSeq.current) return acc;
    setAccount(acc);
    setAccountLoading(false);
    if (acc?.name) {
      const name = acc.name;
      setDraft((d) => {
        if (d.name) return d;
        const next = { ...d, name };
        saveDraft(next);
        return next;
      });
    }
    return acc;
  }, []);

  // A signed-in visitor with an open request sees it instead of the form.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      accountSeq.current++;
      setAccount(null);
      setAccountLoading(false);
      autoPromptedRef.current = false;
      setCheckedExisting(true);
      return;
    }
    let cancelled = false;
    fetchMyDemo()
      .then(({ request }) => {
        if (cancelled) return;
        if (request && ['pending', 'contacted', 'approved'].includes(request.status)) {
          setExisting(request);
          writeDemoActive(request);
        }
      })
      .finally(() => !cancelled && setCheckedExisting(true));
    // Google's display name fills the field at once; the account's name follows.
    setDraft((d) => (d.name || !user.name ? d : { ...d, name: user.name }));
    loadAccount();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, loadAccount]);

  // Signed in on "Who is joining?" but the phone is not verified (for example,
  // back from a Google redirect): ask for the OTP once, by itself.
  useEffect(() => {
    if (
      user &&
      account &&
      !account.phone_verified &&
      !accountLoading &&
      draft.step === 1 &&
      !phoneDialog &&
      !googleBusy &&
      !autoPromptedRef.current
    ) {
      autoPromptedRef.current = true;
      setPhoneDialog(true);
    }
  }, [user, account, accountLoading, draft.step, phoneDialog, googleBusy]);

  const days = useMemo(() => (now ? availableDemoDays(now, schedule) : []), [now, schedule]);

  // A restored draft may point at a day that has passed.
  useEffect(() => {
    if (!days.length || !draft.date || draft.window === 'anytime') return;
    const day = days.find((d) => d.date === draft.date);
    if (!day) setDraft((d) => ({ ...d, date: null, window: null, step: 0 }));
    else if (draft.window && !day.windows.includes(draft.window as DemoWindowId)) setDraft((d) => ({ ...d, window: null, step: 0 }));
  }, [days, draft.date, draft.window]);

  const update = useCallback((patch: Partial<DemoDraft>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      saveDraft(next);
      return next;
    });
  }, []);

  const goStep = (step: 0 | 1) => {
    update({ step });
    setError(null);
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  const selectedDay = days.find((d) => d.date === draft.date) ?? null;
  const parentPhoneOk = !draft.parentPhone || /^[6-9]\d{9}$/.test(draft.parentPhone.replace(/\D/g, '').slice(-10));
  const step0Done = draft.window === 'anytime' || (!!draft.date && !!draft.window);
  const step1Done = draft.name.trim().length >= 2 && parentPhoneOk;
  const phoneVerified = !!account?.phone_verified;
  const accountName = account?.name || user?.name || '';
  const namePrefilled = !!draft.name && draft.name === accountName;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const pageCode = from ? FROM_PAGE_CODE[from] : undefined;
    const result = await submitDemoRequest(draft, touchAttribution(pageCode) as unknown as Record<string, unknown>);
    setSubmitting(false);
    if (result.ok) {
      clearDraft();
      setBooked(result.request);
      writeDemoActive(result.request);
      fireDemoConversion(result.request.ref);
      trackTaxonomyEvent('demo_requested', { ref: result.request.ref, window: draft.window, parent: draft.parentJoining, from });
      requestAnimationFrame(() => headingRef.current?.focus());
      return;
    }
    // Safety nets: the button shows only when signed in with a verified phone,
    // but the session can expire or the account can change underneath.
    if (result.code === 'SIGN_IN_REQUIRED') {
      setError('Your sign-in expired. Please sign in again.');
      loadAccount(true);
    } else if (result.code === 'PHONE_REQUIRED') {
      setPhoneDialog(true);
      loadAccount(true);
    } else if (result.code === 'ACTIVE_REQUEST' && result.request) {
      clearDraft();
      setExisting(result.request);
      writeDemoActive(result.request);
    } else {
      setError(result.message);
      if (/no longer available/i.test(result.message)) {
        setNow(new Date());
        goStep(0);
      }
    }
  };

  /** "Continue with Google": straight to Google, then the OTP if the account has no verified phone. */
  const onGoogle = async () => {
    trackTaxonomyEvent('demo_signin_started', { method: 'google' });
    setSignInError(null);
    setGoogleBusy(true);
    autoPromptedRef.current = true;
    try {
      const { signInWithGoogleOrRedirect } = await import('@neram/auth');
      const signedIn = await signInWithGoogleOrRedirect();
      if (!signedIn) return; // closed the popup, or on the way to Google
      trackTaxonomyEvent('demo_signin_completed', { method: 'google' });
      const acc = await loadAccount(true);
      if (!acc?.phone_verified) setPhoneDialog(true);
    } catch {
      setSignInError('Google sign-in did not finish. Try again, or use your phone number.');
    } finally {
      setGoogleBusy(false);
    }
  };

  /** "Use my phone number": the OTP on its own signs the visitor in. */
  const onPhone = () => {
    trackTaxonomyEvent('demo_signin_started', { method: 'phone' });
    setSignInError(null);
    autoPromptedRef.current = true;
    setPhoneDialog(true);
  };

  /** "Not you?": sign out but keep the time and the answers. */
  const onSwitchAccount = async () => {
    setError(null);
    try {
      const { firebaseSignOut } = await import('@neram/auth');
      await firebaseSignOut();
    } catch {
      // Already signed out.
    }
  };

  const onPhoneVerified = async () => {
    const signedInBefore = !!user;
    setPhoneDialog(false);
    if (!signedInBefore) trackTaxonomyEvent('demo_signin_completed', { method: 'phone' });
    trackTaxonomyEvent('demo_phone_verified');
    await loadAccount(true);
  };

  const shareWithParent = async () => {
    trackTaxonomyEvent('demo_parent_share_clicked');
    const text =
      'I booked a free online demo class for NATA / JEE Paper 2 coaching at Neram Classes. Parents are welcome to join and ask questions: https://neramclasses.com/demo-class';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Neram free demo class', text });
        return;
      }
    } catch {
      return; // the person closed the share sheet
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  // ---------- Render ----------

  if (!mounted || (authLoading && !checkedExisting)) {
    return (
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }} aria-busy aria-label="Loading demo booking">
        <Skeleton variant="text" width="50%" height={36} />
        <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" width={76} height={64} />
          ))}
        </Box>
        <Skeleton variant="rounded" height={72} sx={{ mt: 2 }} />
        <Skeleton variant="rounded" height={52} sx={{ mt: 2 }} />
      </Paper>
    );
  }

  if (booked) {
    return (
      <Box>
        <Typography ref={headingRef} tabIndex={-1} variant="h5" component="h2" fontWeight={800} sx={{ mb: 1.5, outline: 'none' }}>
          Request received. Your demo ref is {booked.ref}
        </Typography>
        <DemoStatusCard
          request={booked}
          settings={publicSettings}
          origin=""
          heading="Booked"
          actions={
            <>
              <Button variant="outlined" startIcon={<ShareIcon />} onClick={shareWithParent} sx={{ minHeight: 48 }}>
                Tell your parent
              </Button>
              <Button href="/demo-class/my" sx={{ minHeight: 48 }}>
                View my demo
              </Button>
              {applyDraftExists && (
                <Button href="/apply" endIcon={<ArrowForwardIcon />} sx={{ minHeight: 48 }}>
                  Continue your application
                </Button>
              )}
            </>
          }
        />
      </Box>
    );
  }

  if (existing) {
    return (
      <DemoStatusCard
        request={existing}
        settings={publicSettings}
        origin=""
        heading="You already have a demo booked"
        actions={
          <Button variant="outlined" href="/demo-class/my" sx={{ minHeight: 48 }}>
            Change or cancel
          </Button>
        }
      />
    );
  }

  const step = draft.step;

  return (
    <Paper
      component="section"
      aria-labelledby="demo-step-title"
      variant="outlined"
      sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}
    >
      {/* Progress */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        {step > 0 && (
          <Button
            onClick={() => goStep(0)}
            startIcon={<ArrowBackIcon />}
            sx={{ minHeight: 44, ml: -1, px: 1 }}
            aria-label={`Back to step ${step}`}
          >
            Back
          </Button>
        )}
        <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ ml: 'auto' }}>
          Step {step + 1} of {STEP_TITLES.length}
        </Typography>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${STEP_TITLES.length}, 1fr)`, gap: 0.5, mb: 2 }} aria-hidden>
        {STEP_TITLES.map((_, i) => (
          <Box key={i} sx={{ height: 4, borderRadius: 2, bgcolor: i <= step ? 'primary.main' : 'action.disabledBackground' }} />
        ))}
      </Box>
      <Typography
        id="demo-step-title"
        ref={headingRef}
        tabIndex={-1}
        variant="h5"
        component="h2"
        fontWeight={800}
        sx={{ outline: 'none', fontSize: { xs: '1.35rem', sm: '1.5rem' } }}
      >
        {STEP_TITLES[step]}
      </Typography>

      {/* Step 1: when */}
      {step === 0 && (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Pick a day and a time of day. We call you to fix the exact time.
          </Typography>
          <Box
            role="group"
            aria-label="Day"
            sx={{
              display: 'flex',
              flexWrap: { xs: 'nowrap', sm: 'wrap' },
              gap: 1,
              mt: 2,
              overflowX: { xs: 'auto', sm: 'visible' },
              pb: 1,
              mx: { xs: -2, sm: 0 },
              px: { xs: 2, sm: 0 },
              scrollSnapType: 'x proximity',
              overscrollBehaviorX: 'contain',
              '&::-webkit-scrollbar': { display: 'none' },
              scrollbarWidth: 'none',
            }}
          >
            {days.map((d) => {
              const sel = draft.date === d.date && draft.window !== 'anytime';
              return (
                <ButtonBase
                  key={d.date}
                  onClick={() => {
                    const keep = draft.window && draft.window !== 'anytime' && d.windows.includes(draft.window as DemoWindowId);
                    update({ date: d.date, window: keep ? draft.window : null });
                  }}
                  aria-pressed={sel}
                  aria-label={`${d.label}, ${d.sub}`}
                  sx={{
                    flex: '0 0 auto',
                    width: 76,
                    minHeight: 68,
                    borderRadius: 2,
                    border: 2,
                    borderColor: sel ? 'primary.main' : 'divider',
                    bgcolor: sel ? 'primary.main' : 'background.paper',
                    color: sel ? 'primary.contrastText' : 'text.primary',
                    flexDirection: 'column',
                    scrollSnapAlign: 'start',
                    ...focusRing,
                  }}
                >
                  <Typography variant="caption" fontWeight={700} sx={{ color: 'inherit', opacity: sel ? 1 : 0.8 }}>
                    {d.label}
                  </Typography>
                  <Typography variant="subtitle1" fontWeight={800} sx={{ color: 'inherit', lineHeight: 1.2 }}>
                    {d.sub}
                  </Typography>
                </ButtonBase>
              );
            })}
          </Box>

          <Collapse in={!!selectedDay && draft.window !== 'anytime'} unmountOnExit>
            <Box role="group" aria-label="Time of day" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1, mt: 1.5 }}>
              {schedule.windows.map((w) => {
                const available = !!selectedDay?.windows.includes(w.id);
                const sel = draft.window === w.id;
                const Icon = WINDOW_ICON[w.id];
                return (
                  <ButtonBase
                    key={w.id}
                    disabled={!available}
                    onClick={() => {
                      update({ window: w.id });
                      trackTaxonomyEvent('demo_window_picked', { window: w.id });
                    }}
                    aria-pressed={sel}
                    sx={{
                      minHeight: 56,
                      px: 2,
                      borderRadius: 2,
                      border: 2,
                      borderColor: sel ? 'primary.main' : 'divider',
                      bgcolor: sel ? 'primary.main' : 'background.paper',
                      color: sel ? 'primary.contrastText' : 'text.primary',
                      justifyContent: { xs: 'flex-start', sm: 'center' },
                      gap: 1.25,
                      opacity: available ? 1 : 0.45,
                      ...focusRing,
                    }}
                  >
                    <Icon aria-hidden />
                    <Box sx={{ textAlign: 'left' }}>
                      <Typography fontWeight={800} sx={{ color: 'inherit', lineHeight: 1.2 }}>
                        {w.label}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'inherit', opacity: 0.85 }}>
                        {available ? formatWindowRange(w) : 'Not available'}
                      </Typography>
                    </Box>
                    {sel && <CheckCircleIcon aria-hidden sx={{ ml: 'auto', fontSize: 20 }} />}
                  </ButtonBase>
                );
              })}
            </Box>
          </Collapse>

          <ButtonBase
            onClick={() => {
              update({ window: 'anytime', date: null });
              trackTaxonomyEvent('demo_window_picked', { window: 'anytime' });
            }}
            aria-pressed={draft.window === 'anytime'}
            sx={{
              mt: 1.5,
              width: '100%',
              minHeight: 52,
              px: 2,
              borderRadius: 2,
              border: 2,
              borderStyle: draft.window === 'anytime' ? 'solid' : 'dashed',
              borderColor: draft.window === 'anytime' ? 'primary.main' : 'divider',
              bgcolor: draft.window === 'anytime' ? 'primary.main' : 'transparent',
              color: draft.window === 'anytime' ? 'primary.contrastText' : 'text.primary',
              justifyContent: 'flex-start',
              gap: 1.25,
              ...focusRing,
            }}
          >
            <PhoneInTalkOutlinedIcon aria-hidden />
            <Typography fontWeight={700} sx={{ color: 'inherit', textAlign: 'left' }}>
              Any time works, just call me
            </Typography>
            {draft.window === 'anytime' && <CheckCircleIcon aria-hidden sx={{ ml: 'auto', fontSize: 20 }} />}
          </ButtonBase>

          <Button
            variant="contained"
            size="large"
            fullWidth
            disabled={!step0Done}
            onClick={() => goStep(1)}
            sx={{ mt: 2.5, minHeight: 52, fontWeight: 700, fontSize: '1.05rem' }}
          >
            Continue
          </Button>
        </Box>
      )}

      {/* Step 2: who. Sign in first, then only what the account cannot tell us. */}
      {step === 1 && (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {formatDemoPreference(draft.date, draft.window as DemoWindow, schedule)}
          </Typography>

          {(authLoading || (user && accountLoading && !account)) && (
            <Box aria-busy aria-label="Checking your account" sx={{ mt: 2 }}>
              <Skeleton variant="rounded" height={76} />
              <Skeleton variant="rounded" height={56} sx={{ mt: 2 }} />
              <Skeleton variant="text" width="30%" sx={{ mt: 2 }} />
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} variant="rounded" width={96} height={48} sx={{ borderRadius: 999 }} />
                ))}
              </Box>
            </Box>
          )}

          {/* Signed out: one tap with Google, or the phone OTP on its own. */}
          {!authLoading && !user && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body1" sx={{ mb: 2 }}>
                Sign in so we know who to call. Your name fills in by itself and the Teams link reaches your WhatsApp.
              </Typography>
              <GoogleCard
                title="Continue with Google"
                body="Fills in your name. Then we verify your phone with a code."
                onClick={onGoogle}
                busy={googleBusy}
              />
              <Box sx={{ my: 2 }}>
                <OrDivider label="or" />
              </Box>
              <Button
                variant="outlined"
                size="large"
                fullWidth
                onClick={onPhone}
                disabled={googleBusy}
                startIcon={<SmartphoneOutlinedIcon aria-hidden />}
                sx={{ minHeight: 52, fontWeight: 700, borderWidth: 2, '&:hover': { borderWidth: 2 } }}
              >
                Use my phone number
              </Button>
              {signInError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {signInError}
                </Alert>
              )}
              {error && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  {error}
                </Alert>
              )}
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                <LockOutlinedIcon aria-hidden fontSize="small" sx={{ mt: '2px' }} />
                We only use your number to call you about this demo and send the Teams link on WhatsApp. Free, no payment.
              </Typography>
            </Box>
          )}

          {/* Signed in: who is booking, then the few questions left. */}
          {!authLoading && user && (account || !accountLoading) && (
            <Box
              component="form"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (step1Done && phoneVerified && !submitting) {
                  trackTaxonomyEvent('demo_details_done');
                  submit();
                }
              }}
            >
              <Box
                sx={{
                  mt: 2,
                  p: 2,
                  borderRadius: 2,
                  border: 1,
                  borderColor: phoneVerified ? 'divider' : 'warning.main',
                  bgcolor: phoneVerified ? 'background.paper' : 'action.hover',
                }}
              >
                <Typography fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>
                  {accountName || account?.email || user.email || 'Signed in'}
                </Typography>
                {phoneVerified ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">
                      {maskPhone(account?.phone)}
                    </Typography>
                    <Chip
                      icon={<VerifiedOutlinedIcon aria-hidden />}
                      label="Verified"
                      size="small"
                      color="success"
                      variant="outlined"
                    />
                  </Box>
                ) : (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start' }}>
                      <ErrorOutlineIcon aria-hidden fontSize="small" sx={{ mt: '2px', color: 'warning.dark' }} />
                      Verify your WhatsApp number so we can call you and send the Teams link.
                    </Typography>
                    <Button
                      variant="contained"
                      onClick={() => setPhoneDialog(true)}
                      startIcon={<SmartphoneOutlinedIcon aria-hidden />}
                      sx={{ mt: 1.5, minHeight: 48, fontWeight: 700 }}
                    >
                      Verify phone
                    </Button>
                  </Box>
                )}
                <Button
                  onClick={onSwitchAccount}
                  size="small"
                  sx={{ mt: 1, ml: -1, minHeight: 44, px: 1, fontWeight: 600 }}
                >
                  Not you? Use another account
                </Button>
              </Box>

              <TextField
                label="Student name"
                value={draft.name}
                onChange={(e) => update({ name: e.target.value })}
                fullWidth
                required
                autoComplete="name"
                helperText="Booking for your child? Change the name."
                sx={{ mt: 2.5 }}
                inputProps={{ maxLength: 100, style: { fontSize: 16 } }}
                InputProps={{
                  endAdornment: namePrefilled ? (
                    <InputAdornment position="end">
                      <Chip label="Pre-filled" size="small" color="info" variant="outlined" />
                    </InputAdornment>
                  ) : undefined,
                }}
              />
              <Typography component="p" variant="subtitle2" fontWeight={700} sx={{ mt: 2.5, mb: 1 }} id="class-label">
                Class
              </Typography>
              <Box role="group" aria-labelledby="class-label" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {CLASSES.map((c) => (
                  <Pill key={c.v} selected={draft.currentClass === c.v} onClick={() => update({ currentClass: draft.currentClass === c.v ? '' : c.v })}>
                    {c.l}
                  </Pill>
                ))}
              </Box>
              <Typography component="p" variant="subtitle2" fontWeight={700} sx={{ mt: 2.5, mb: 1 }} id="lang-label">
                Class language
              </Typography>
              <Box role="group" aria-labelledby="lang-label" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {LANGUAGES.map((l) => (
                  <Pill key={l.v} selected={draft.language === l.v} onClick={() => update({ language: l.v })}>
                    {l.l}
                  </Pill>
                ))}
              </Box>

              <Box sx={{ mt: 2.5, p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
                <FormControlLabel
                  control={<Switch checked={draft.parentJoining} onChange={(e) => update({ parentJoining: e.target.checked })} />}
                  label={<Typography fontWeight={700}>A parent will join too</Typography>}
                  sx={{ minHeight: 48, mr: 0 }}
                />
                <Typography variant="body2" color="text.secondary">
                  Parents are welcome. Ask all your doubts together and see how a real class runs.
                </Typography>
                <Collapse in={draft.parentJoining} unmountOnExit>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mt: 1.5 }}>
                    <TextField
                      label="Parent name (optional)"
                      value={draft.parentName}
                      onChange={(e) => update({ parentName: e.target.value })}
                      inputProps={{ maxLength: 100, style: { fontSize: 16 } }}
                    />
                    <TextField
                      label="Parent WhatsApp (optional)"
                      value={draft.parentPhone}
                      onChange={(e) => update({ parentPhone: e.target.value.replace(/[^\d+ ]/g, '') })}
                      inputProps={{ inputMode: 'tel', maxLength: 15, style: { fontSize: 16 } }}
                      error={!parentPhoneOk}
                      helperText={parentPhoneOk ? 'Gets the reminders too' : 'Enter a 10-digit mobile number'}
                    />
                  </Box>
                </Collapse>
              </Box>

              {error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {error}
                </Alert>
              )}
              <Button
                type="submit"
                variant="contained"
                size="large"
                fullWidth
                disabled={!step1Done || !phoneVerified || submitting}
                startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : undefined}
                sx={{ mt: 2.5, minHeight: 56, fontWeight: 800, fontSize: '1.05rem' }}
              >
                {submitting ? 'Booking your demo' : 'Request my free demo'}
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 1 }}>
                {phoneVerified ? 'Free. No payment, no card.' : 'Verify your phone above to send the request.'}
              </Typography>
            </Box>
          )}
        </Box>
      )}

      <LoginModal
        open={phoneDialog}
        onClose={() => setPhoneDialog(false)}
        allowClose
        phoneOnly
        initialPhone={(account?.phone || '').replace(/\D/g, '').slice(-10)}
        apiBaseUrl={APP_URL}
        onAuthenticated={onPhoneVerified}
      />
    </Paper>
  );
}
