'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Alert, Box, Button, CircularProgress, Skeleton, TextField, Typography } from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import SmartphoneOutlinedIcon from '@mui/icons-material/SmartphoneOutlined';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
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
import { examYearChoices } from '@neram/database/academic-year';
import type { BookSuggestion } from '@/lib/aintra/booking';
import type { PublicDemoRequest } from '@/lib/demo-request';
import { touchAttribution } from '@/lib/attribution';
import { trackTaxonomyEvent } from '@/lib/funnel-tracker';
import { writeDemoActive } from '@/lib/demo-cta';
import { ensureAccount, type EnsuredAccount } from '@/lib/ensure-account';
import { EMPTY_DRAFT, fetchMyDemo, submitDemoRequest, updateMyDemo } from '@/components/demo-class/demo-client';
import { BookingCardFrame, ChoicePill, FieldLabel, PillRow, useAintraBooking } from './BookingContext';

const LoginModal = dynamic(() => import('@neram/ui').then((m) => m.LoginModal), { ssr: false });
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';
const ACTIVE = ['pending', 'contacted', 'approved'];

/** The suggestion when it is really offered, else the first open day and window. */
function initialPick(days: ReturnType<typeof availableDemoDays>, s: BookSuggestion): { date: string | null; window: DemoWindow | null } {
  if (s.window === 'anytime') return { date: null, window: 'anytime' };
  const day = days.find((d) => d.date === s.date) ?? (s.window ? days.find((d) => d.windows.includes(s.window as DemoWindowId)) : null) ?? days[0];
  if (!day) return { date: null, window: 'anytime' };
  const window = s.window && day.windows.includes(s.window as DemoWindowId) ? (s.window as DemoWindowId) : day.windows[0] ?? null;
  return { date: day.date, window };
}

/**
 * Book a free demo class inside the Aintra chat. The booking rules are the demo
 * page's: sign in, a verified phone, one open request per person, the exam
 * year required. A guest gets the chat's own sign-in; someone who already has
 * a demo sees it, with Change time.
 */
export default function DemoCard({ suggestion }: { suggestion: BookSuggestion }) {
  const ctx = useAintraBooking();
  const { user, loading: authLoading } = useFirebaseAuth();
  const [now] = useState(() => new Date());
  const [schedule, setSchedule] = useState<DemoScheduleSettings | null>(null);
  const [callbackPromise, setCallbackPromise] = useState('within 2 working hours');
  const [account, setAccount] = useState<EnsuredAccount | null>(null);
  const [existing, setExisting] = useState<PublicDemoRequest | null>(null);
  const [checked, setChecked] = useState(false);
  const [changing, setChanging] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [window, setWindow] = useState<DemoWindow | null>(null);
  const [name, setName] = useState('');
  const [examYear, setExamYear] = useState<number | null>(null);
  const [phoneDialog, setPhoneDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<PublicDemoRequest | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/demo-class/settings', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setSchedule(resolveDemoSchedule(d?.settings?.schedule ?? d?.settings ?? DEFAULT_DEMO_SCHEDULE));
        if (d?.settings?.callbackPromise) setCallbackPromise(d.settings.callbackPromise);
      })
      .catch(() => !cancelled && setSchedule(DEFAULT_DEMO_SCHEDULE));
    return () => {
      cancelled = true;
    };
  }, []);

  const days = useMemo(() => (schedule ? availableDemoDays(now, schedule) : []), [now, schedule]);

  // The first pick follows what the visitor asked for, once the days are known.
  useEffect(() => {
    if (!schedule || date || window) return;
    const pick = initialPick(days, suggestion);
    setDate(pick.date);
    setWindow(pick.window);
  }, [schedule, days, suggestion, date, window]);

  const loadAccount = useCallback(async (force = false) => {
    const acc = await ensureAccount({ force });
    setAccount(acc);
    const accountName = acc?.name && acc.name !== 'User' ? acc.name : '';
    if (accountName) setName((n) => n || accountName);
    return acc;
  }, []);

  // Signed in: their open demo, if any, and the account behind them.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setAccount(null);
      setExisting(null);
      setChecked(true);
      return;
    }
    let cancelled = false;
    setChecked(false);
    Promise.all([fetchMyDemo(), loadAccount()])
      .then(([{ request }]) => {
        if (cancelled) return;
        if (request && ACTIVE.includes(request.status)) setExisting(request);
      })
      .finally(() => !cancelled && setChecked(true));
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, loadAccount]);

  const yearChoices = useMemo(() => examYearChoices(now), [now]);
  const selectedDay = days.find((d) => d.date === date) ?? null;
  const whenOk = window === 'anytime' || (!!selectedDay && !!window && selectedDay.windows.includes(window as DemoWindowId));
  const detailsOk = name.trim().length >= 2 && examYear !== null && yearChoices.includes(examYear);
  const phoneVerified = !!account?.phone_verified;
  const preference = schedule ? formatDemoPreference(window === 'anytime' ? null : date, window, schedule) : '';

  const book = async () => {
    if (!whenOk || !detailsOk || !window) return;
    setBusy(true);
    setError(null);
    const result = await submitDemoRequest(
      { ...EMPTY_DRAFT, step: 1, date: window === 'anytime' ? null : date, window, name: name.trim(), examYear },
      touchAttribution('AI-DEM') as unknown as Record<string, unknown>,
    );
    setBusy(false);
    if (result.ok) {
      setBooked(result.request);
      writeDemoActive(result.request);
      trackTaxonomyEvent('demo_requested', { ref: result.request.ref, window, from: 'aintra' });
      return;
    }
    if (result.code === 'PHONE_REQUIRED') setPhoneDialog(true);
    else if (result.code === 'ACTIVE_REQUEST' && result.request) setExisting(result.request);
    else if (result.code === 'SIGN_IN_REQUIRED') ctx?.openSignIn();
    else setError(result.message);
  };

  const changeTime = async () => {
    if (!whenOk || !window) return;
    setBusy(true);
    setError(null);
    const result = await updateMyDemo({ action: 'change_preference', date: window === 'anytime' ? null : date, window });
    setBusy(false);
    if (result.ok) {
      setExisting(result.request);
      writeDemoActive(result.request);
      setChanging(false);
    } else {
      setError(result.message);
    }
  };

  if (!schedule || authLoading || !checked) {
    return (
      <Box aria-busy aria-label="Loading demo booking" sx={{ display: 'grid', gap: 1 }}>
        <Skeleton variant="text" width="45%" height={28} />
        <Box sx={{ display: 'flex', gap: 1 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" width={88} height={48} />
          ))}
        </Box>
        <Skeleton variant="rounded" height={48} />
      </Box>
    );
  }

  if (booked) {
    return (
      <BookingCardFrame icon={<CheckCircleRoundedIcon />} title={`Demo booked. Your ref is ${booked.ref}`} labelledBy="aintra-demo-done">
        <Typography role="status" sx={{ fontSize: '1rem', lineHeight: 1.5 }}>
          {formatDemoPreference(booked.preferredDate, booked.preferredWindow as DemoWindow, schedule)}. We will call you {callbackPromise} to
          fix the exact time, and the Teams link comes on WhatsApp.
        </Typography>
        <Button href="/demo-class/my" variant="outlined" sx={{ alignSelf: 'flex-start', minHeight: 48, textTransform: 'none', fontWeight: 700 }}>
          View my demo
        </Button>
      </BookingCardFrame>
    );
  }

  const picker = (
    <>
      <Box>
        <FieldLabel id="aintra-demo-day">Which day?</FieldLabel>
        <PillRow label="Which day?">
          {days.map((d) => (
            <ChoicePill
              key={d.date}
              selected={date === d.date && window !== 'anytime'}
              onClick={() => {
                setDate(d.date);
                if (!window || window === 'anytime' || !d.windows.includes(window as DemoWindowId)) setWindow(d.windows[0] ?? null);
              }}
              sub={d.sub}
              label={`${d.label}, ${d.sub}`}
            >
              {d.label}
            </ChoicePill>
          ))}
        </PillRow>
        <Box sx={{ mt: 1, display: 'grid' }}>
          <ChoicePill selected={window === 'anytime'} onClick={() => setWindow('anytime')}>
            Any time works, just call me
          </ChoicePill>
        </Box>
      </Box>
      {window !== 'anytime' && selectedDay && (
        <Box>
          <FieldLabel id="aintra-demo-window">What time?</FieldLabel>
          <PillRow label="What time?" layout="grid">
            {schedule.windows.map((w) => (
              <ChoicePill
                key={w.id}
                selected={window === w.id}
                disabled={!selectedDay.windows.includes(w.id)}
                onClick={() => setWindow(w.id)}
                compact
                sub={selectedDay.windows.includes(w.id) ? formatWindowRange(w) : 'Not available'}
              >
                {w.label}
              </ChoicePill>
            ))}
          </PillRow>
        </Box>
      )}
    </>
  );

  if (existing) {
    return (
      <BookingCardFrame icon={<EventAvailableRoundedIcon />} title="You already have a demo booked" labelledBy="aintra-demo-existing">
        <Typography sx={{ fontSize: '1rem', lineHeight: 1.5 }}>
          Ref {existing.ref}: {formatDemoPreference(existing.preferredDate, existing.preferredWindow as DemoWindow, schedule)}.
          {existing.status === 'approved' && existing.scheduledStart ? ' It is confirmed; the link is on WhatsApp.' : ''}
        </Typography>
        {changing && picker}
        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {changing ? (
            <Button
              variant="contained"
              disableElevation
              onClick={changeTime}
              disabled={busy || !whenOk}
              startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
              sx={{ minHeight: 48, fontWeight: 800, textTransform: 'none', flex: { xs: '1 1 100%', sm: '0 0 auto' } }}
            >
              {busy ? 'Saving' : `Change to ${preference}`}
            </Button>
          ) : (
            existing.status !== 'approved' && (
              <Button variant="outlined" onClick={() => setChanging(true)} sx={{ minHeight: 48, fontWeight: 700, textTransform: 'none' }}>
                Change time
              </Button>
            )
          )}
          <Button href="/demo-class/my" sx={{ minHeight: 48, fontWeight: 700, textTransform: 'none' }}>
            View my demo
          </Button>
        </Box>
      </BookingCardFrame>
    );
  }

  return (
    <BookingCardFrame icon={<EventAvailableRoundedIcon />} title="Book a free demo class" labelledBy="aintra-demo-title">
      {picker}

      {user && (
        <>
          <TextField
            label="Student name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            fullWidth
            autoComplete="name"
            helperText="Booking for your child? Change the name."
            inputProps={{ maxLength: 100, style: { fontSize: 16 } }}
          />
          <Box>
            <FieldLabel id="aintra-demo-year">Which year will you write NATA or JEE B.Arch?</FieldLabel>
            <PillRow label="Exam year">
              {yearChoices.map((y) => (
                <ChoicePill key={y} selected={examYear === y} onClick={() => setExamYear(y)} label={`Exam year ${y}`}>
                  {String(y)}
                </ChoicePill>
              ))}
            </PillRow>
          </Box>
        </>
      )}

      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}

      {!user ? (
        <>
          <Button
            variant="contained"
            disableElevation
            fullWidth
            onClick={() => ctx?.openSignIn()}
            disabled={!whenOk}
            startIcon={<LoginRoundedIcon />}
            sx={{ minHeight: 48, fontWeight: 800, textTransform: 'none', fontSize: '1rem' }}
          >
            Sign in to book
          </Button>
          <Typography variant="caption" color="text.secondary">
            Sign in with Google or your phone so we know who to call. Your choice above is kept.
          </Typography>
        </>
      ) : !phoneVerified ? (
        <>
          <Button
            variant="contained"
            disableElevation
            fullWidth
            onClick={() => setPhoneDialog(true)}
            startIcon={<SmartphoneOutlinedIcon />}
            sx={{ minHeight: 48, fontWeight: 800, textTransform: 'none', fontSize: '1rem' }}
          >
            Verify your phone to book
          </Button>
          <Typography variant="caption" color="text.secondary">
            We call you on this number and send the Teams link on WhatsApp.
          </Typography>
        </>
      ) : (
        <>
          <Button
            variant="contained"
            disableElevation
            fullWidth
            onClick={book}
            disabled={busy || !whenOk || !detailsOk}
            startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
            sx={{ minHeight: 48, fontWeight: 800, textTransform: 'none', fontSize: '1rem' }}
          >
            {busy ? 'Booking' : 'Book my free demo'}
          </Button>
          <Typography variant="caption" color="text.secondary">
            {examYear === null ? 'Pick your exam year to book. ' : ''}
            {preference}. Free, no payment.
          </Typography>
        </>
      )}

      {phoneDialog && (
        <LoginModal
          open={phoneDialog}
          onClose={() => setPhoneDialog(false)}
          allowClose
          phoneOnly
          initialPhone={(account?.phone || '').replace(/\D/g, '').slice(-10)}
          apiBaseUrl={APP_URL}
          // Above the chat drawer (1450) and its menus (1460).
          zIndex={1500}
          onAuthenticated={async () => {
            setPhoneDialog(false);
            await loadAccount(true);
          }}
        />
      )}
    </BookingCardFrame>
  );
}
