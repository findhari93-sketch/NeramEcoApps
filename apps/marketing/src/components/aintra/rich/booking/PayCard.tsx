'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, Skeleton, Typography } from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import CurrencyRupeeRoundedIcon from '@mui/icons-material/CurrencyRupeeRounded';
import HourglassTopRoundedIcon from '@mui/icons-material/HourglassTopRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { currentIdToken } from '@/components/demo-class/demo-client';
import { BookingCardFrame, useAintraBooking } from './BookingContext';

interface PayAction {
  id: string;
  label: string;
  href: string | null;
}

interface Loaded {
  actions: PayAction[];
  pending: { amount: number; submittedAt: string | null } | null;
}

const buttonSx = { minHeight: 48, fontWeight: 800, textTransform: 'none', fontSize: '1rem', justifyContent: 'center' } as const;

/**
 * What the signed-in student owes, with one button per payment (2026-10-20).
 * Nothing is paid here: each button opens the page that takes that payment
 * (UPI, bank transfer or card), so the amount always comes from the fee plan.
 */
export default function PayCard() {
  const ctx = useAintraBooking();
  const { user, loading: authLoading } = useFirebaseAuth();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    setLoaded(null);
    setError(null);
    (async () => {
      const token = await currentIdToken();
      const res = await fetch('/api/aintra/pay-options', { cache: 'no-store', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) setError(data?.error && data.error !== 'SIGN_IN_REQUIRED' ? data.error : 'Could not load your fees. Please try again.');
      else setLoaded({ actions: Array.isArray(data.actions) ? data.actions : [], pending: data.pending ?? null });
    })().catch(() => !cancelled && setError('Could not load your fees. Please try again.'));
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  if (!authLoading && !user) {
    return (
      <BookingCardFrame icon={<CurrencyRupeeRoundedIcon />} title="Sign in to see your fees" labelledBy="aintra-pay-signin">
        <Typography sx={{ fontSize: '1rem', lineHeight: 1.5 }}>Sign in with the Google account or phone number you applied with.</Typography>
        <Button variant="contained" disableElevation fullWidth onClick={() => ctx?.openSignIn()} startIcon={<LoginRoundedIcon />} sx={buttonSx}>
          Sign in
        </Button>
      </BookingCardFrame>
    );
  }

  if (error) {
    return (
      <Alert severity="error" role="alert">
        {error}
      </Alert>
    );
  }

  if (!loaded) {
    return (
      <Box aria-busy aria-label="Loading your fees" sx={{ display: 'grid', gap: 1 }}>
        <Skeleton variant="text" width="45%" height={28} />
        <Skeleton variant="rounded" height={48} />
      </Box>
    );
  }

  const payable = loaded.actions.filter((a) => a.href);

  return (
    <BookingCardFrame icon={<CurrencyRupeeRoundedIcon />} title={payable.length ? 'Your fees' : 'Nothing to pay right now'} labelledBy="aintra-pay-title">
      {loaded.pending && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <HourglassTopRoundedIcon aria-hidden sx={{ color: 'text.secondary', mt: '2px' }} />
          <Typography sx={{ fontSize: '1rem', lineHeight: 1.5 }}>
            Your payment of ₹{Math.round(loaded.pending.amount).toLocaleString('en-IN')} is with our team to verify. We let you know once it is done.
          </Typography>
        </Box>
      )}
      {payable.map((a, i) => (
        <Button
          key={a.id}
          component={Link}
          href={a.href as string}
          variant={i === 0 ? 'contained' : 'outlined'}
          disableElevation
          fullWidth
          sx={buttonSx}
        >
          {a.label}
        </Button>
      ))}
      {!payable.length && !loaded.pending && (
        <Typography sx={{ fontSize: '1rem', lineHeight: 1.5 }}>There is no fee due on your account. If you expected one, ask me to have our team call you.</Typography>
      )}
      {payable.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start' }}>
          <LockOutlinedIcon aria-hidden sx={{ fontSize: 16, mt: '1px' }} />
          Each button opens our payment page (UPI, bank transfer or card). Nothing is paid in the chat.
        </Typography>
      )}
    </BookingCardFrame>
  );
}
