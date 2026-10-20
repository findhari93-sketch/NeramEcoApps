'use client';

import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Skeleton, TextField, Typography } from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import EventBusyRoundedIcon from '@mui/icons-material/EventBusyRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import {
  formatDemoPreference,
  resolveDemoSchedule,
  DEFAULT_DEMO_SCHEDULE,
  type DemoScheduleSettings,
  type DemoWindow,
} from '@neram/database/demo-schedule';
import type { BookSuggestion } from '@/lib/aintra/booking';
import type { PublicDemoRequest } from '@/lib/demo-request';
import { fetchMyDemo, updateMyDemo } from '@/components/demo-class/demo-client';
import { BookingCardFrame, useAintraBooking } from './BookingContext';

const ACTIVE = ['pending', 'contacted', 'approved'];

type Outcome = 'cancelled' | 'kept' | null;

/**
 * "Cancel my demo", from the Aintra chat (2026-10-20). Cancelling cannot be
 * undone, so nothing happens until the visitor taps "Yes, cancel my demo"; the
 * card shows which booking it is first. Same route as /demo-class/my.
 */
export default function DemoCancelCard({ suggestion }: { suggestion: BookSuggestion }) {
  const ctx = useAintraBooking();
  const { user, loading: authLoading } = useFirebaseAuth();
  const [schedule, setSchedule] = useState<DemoScheduleSettings | null>(null);
  const [demo, setDemo] = useState<PublicDemoRequest | null>(null);
  const [checked, setChecked] = useState(false);
  const [reason, setReason] = useState(suggestion.draft?.reason ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/demo-class/settings', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => !cancelled && setSchedule(resolveDemoSchedule(d?.settings?.schedule ?? d?.settings ?? DEFAULT_DEMO_SCHEDULE)))
      .catch(() => !cancelled && setSchedule(DEFAULT_DEMO_SCHEDULE));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setDemo(null);
      setChecked(true);
      return;
    }
    let cancelled = false;
    setChecked(false);
    fetchMyDemo()
      .then(({ request }) => !cancelled && setDemo(request && ACTIVE.includes(request.status) ? request : null))
      .finally(() => !cancelled && setChecked(true));
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const cancel = async () => {
    setBusy(true);
    setError(null);
    const result = await updateMyDemo({ action: 'cancel', reason: reason.trim() || undefined });
    setBusy(false);
    if (result.ok) {
      setOutcome('cancelled');
    } else if (result.code === 'SIGN_IN_REQUIRED') {
      ctx?.openSignIn();
    } else {
      setError(result.message);
    }
  };

  if (!schedule || authLoading || !checked) {
    return (
      <Box aria-busy aria-label="Loading your demo class" sx={{ display: 'grid', gap: 1 }}>
        <Skeleton variant="text" width="50%" height={28} />
        <Skeleton variant="rounded" height={64} />
        <Skeleton variant="rounded" height={48} />
      </Box>
    );
  }

  if (outcome) {
    const cancelled = outcome === 'cancelled';
    return (
      <BookingCardFrame
        icon={<CheckCircleRoundedIcon />}
        title={cancelled ? 'Demo class cancelled' : 'Your demo is still booked'}
        labelledBy="aintra-demo-cancel-done"
      >
        <Typography role="status" sx={{ fontSize: '1rem', lineHeight: 1.5 }}>
          {cancelled
            ? 'We have let our team know. You can book another time whenever it suits you.'
            : 'Nothing changed. See you at the demo.'}
        </Typography>
        {cancelled && (
          <Button href="/demo-class" variant="outlined" sx={{ alignSelf: 'flex-start', minHeight: 48, textTransform: 'none', fontWeight: 700 }}>
            Book another time
          </Button>
        )}
      </BookingCardFrame>
    );
  }

  if (!user) {
    return (
      <BookingCardFrame icon={<EventBusyRoundedIcon />} title="Sign in to manage your demo" labelledBy="aintra-demo-cancel-signin">
        <Typography sx={{ fontSize: '1rem', lineHeight: 1.5 }}>
          Sign in with the Google account or phone number you booked with.
        </Typography>
        <Button
          variant="contained"
          disableElevation
          fullWidth
          onClick={() => ctx?.openSignIn()}
          startIcon={<LoginRoundedIcon />}
          sx={{ minHeight: 48, fontWeight: 800, textTransform: 'none', fontSize: '1rem' }}
        >
          Sign in
        </Button>
      </BookingCardFrame>
    );
  }

  if (!demo) {
    return (
      <BookingCardFrame icon={<EventBusyRoundedIcon />} title="No demo class to cancel" labelledBy="aintra-demo-cancel-none">
        <Typography sx={{ fontSize: '1rem', lineHeight: 1.5 }}>You have no open demo class booking on this account.</Typography>
      </BookingCardFrame>
    );
  }

  return (
    <BookingCardFrame icon={<EventBusyRoundedIcon />} title="Cancel your demo class?" labelledBy="aintra-demo-cancel-title">
      <Typography sx={{ fontSize: '1rem', lineHeight: 1.5 }}>
        Ref {demo.ref}: {formatDemoPreference(demo.preferredDate, demo.preferredWindow as DemoWindow, schedule)}
        {demo.status === 'approved' ? ', confirmed' : ''}.
      </Typography>
      <TextField
        label="Why are you cancelling? (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        fullWidth
        inputProps={{ maxLength: 200, style: { fontSize: 16 } }}
      />
      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1 }}>
        <Button
          variant="contained"
          color="error"
          disableElevation
          onClick={cancel}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
          sx={{ minHeight: 48, fontWeight: 800, textTransform: 'none', fontSize: '1rem', flex: { sm: 1 } }}
        >
          {busy ? 'Cancelling' : 'Yes, cancel my demo'}
        </Button>
        <Button
          variant="outlined"
          onClick={() => setOutcome('kept')}
          disabled={busy}
          sx={{ minHeight: 48, fontWeight: 700, textTransform: 'none', fontSize: '1rem', flex: { sm: 1 } }}
        >
          Keep my demo
        </Button>
      </Box>
    </BookingCardFrame>
  );
}
