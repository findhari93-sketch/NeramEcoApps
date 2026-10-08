'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
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
import type { PublicDemoRequest } from '@/lib/demo-request';
import DemoStatusCard, { type DemoPublicSettings } from './DemoStatusCard';
import {
  EMPTY_DRAFT,
  clearDraft,
  fetchMyDemo,
  fireDemoConversion,
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

const STEP_TITLES = ['When suits you?', 'Who is joining?', 'Get your demo link'];

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
  const [login, setLogin] = useState<'full' | 'phone' | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Days depend on "now", so they are computed only in the browser.
  useEffect(() => {
    setMounted(true);
    setNow(new Date());
    const saved = loadDraft();
    if (saved) setDraft(saved);
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

  // A signed-in visitor with an open request sees it instead of the form.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setCheckedExisting(true);
      return;
    }
    let cancelled = false;
    fetchMyDemo()
      .then(({ request }) => {
        if (cancelled) return;
        if (request && ['pending', 'contacted', 'approved'].includes(request.status)) setExisting(request);
      })
      .finally(() => !cancelled && setCheckedExisting(true));
    setDraft((d) => (d.name ? d : { ...d, name: user.name || '' }));
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

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

  const goStep = (step: 0 | 1 | 2) => {
    update({ step });
    setError(null);
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  const selectedDay = days.find((d) => d.date === draft.date) ?? null;
  const parentPhoneOk = !draft.parentPhone || /^[6-9]\d{9}$/.test(draft.parentPhone.replace(/\D/g, '').slice(-10));
  const step0Done = draft.window === 'anytime' || (!!draft.date && !!draft.window);
  const step1Done = draft.name.trim().length >= 2 && parentPhoneOk;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const result = await submitDemoRequest(draft, touchAttribution() as unknown as Record<string, unknown>);
    setSubmitting(false);
    if (result.ok) {
      clearDraft();
      setBooked(result.request);
      fireDemoConversion(result.request.ref);
      trackTaxonomyEvent('demo_requested', { ref: result.request.ref, window: draft.window, parent: draft.parentJoining });
      requestAnimationFrame(() => headingRef.current?.focus());
      return;
    }
    if (result.code === 'SIGN_IN_REQUIRED') setLogin('full');
    else if (result.code === 'PHONE_REQUIRED') setLogin('phone');
    else if (result.code === 'ACTIVE_REQUEST' && result.request) {
      clearDraft();
      setExisting(result.request);
    } else {
      setError(result.message);
      if (/no longer available/i.test(result.message)) {
        setNow(new Date());
        goStep(0);
      }
    }
  };

  const onFinalButton = () => {
    trackTaxonomyEvent('demo_signin_started', { signedIn: !!user });
    if (!user) setLogin('full');
    else submit();
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
            onClick={() => goStep((step - 1) as 0 | 1)}
            startIcon={<ArrowBackIcon />}
            sx={{ minHeight: 44, ml: -1, px: 1 }}
            aria-label={`Back to step ${step}`}
          >
            Back
          </Button>
        )}
        <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ ml: 'auto' }}>
          Step {step + 1} of 3
        </Typography>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.5, mb: 2 }} aria-hidden>
        {[0, 1, 2].map((i) => (
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

      {/* Step 2: who */}
      {step === 1 && (
        <Box component="form" noValidate onSubmit={(e) => { e.preventDefault(); if (step1Done) { trackTaxonomyEvent('demo_details_done'); goStep(2); } }}>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {formatDemoPreference(draft.date, draft.window as DemoWindow, schedule)}
          </Typography>
          <TextField
            label="Student name"
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
            fullWidth
            required
            autoComplete="name"
            sx={{ mt: 2 }}
            inputProps={{ maxLength: 100, style: { fontSize: 16 } }}
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

          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={!step1Done}
            sx={{ mt: 2.5, minHeight: 52, fontWeight: 700, fontSize: '1.05rem' }}
          >
            Continue
          </Button>
        </Box>
      )}

      {/* Step 3: sign in and send */}
      {step === 2 && (
        <Box>
          <Box sx={{ mt: 1.5, p: 2, borderRadius: 2, border: 1, borderColor: 'divider' }}>
            <Typography fontWeight={800}>{formatDemoPreference(draft.date, draft.window as DemoWindow, schedule)}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {draft.name}
              {draft.currentClass ? `, ${CLASSES.find((c) => c.v === draft.currentClass)?.l}` : ''}
              {draft.parentJoining ? ', with a parent' : ''}
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ mt: 2, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <LockOutlinedIcon aria-hidden fontSize="small" sx={{ mt: '2px', color: 'text.secondary' }} />
            {user
              ? `Booking as ${user.name || user.email || 'you'}. The Teams link goes to your WhatsApp and your calendar.`
              : 'Sign in so we can send the Teams link to your WhatsApp and Google Calendar. We never share your number.'}
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={onFinalButton}
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : undefined}
            sx={{ mt: 2.5, minHeight: 56, fontWeight: 800, fontSize: '1.05rem' }}
          >
            {submitting ? 'Booking your demo' : user ? 'Request my free demo' : 'Sign in to get your demo link'}
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 1 }}>
            Free. No payment, no card.
          </Typography>
        </Box>
      )}

      <LoginModal
        open={login !== null}
        onClose={() => setLogin(null)}
        allowClose
        phoneOnly={login === 'phone'}
        apiBaseUrl={APP_URL}
        onAuthenticated={() => {
          setLogin(null);
          submit();
        }}
      />
    </Paper>
  );
}
