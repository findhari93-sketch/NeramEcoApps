'use client';

/**
 * The dashboard's "Finish your class setup" card. A student who enrolled with a
 * direct link sees their 5-step progress (or "account on its way") and one
 * button back to /onboarding; the older checklist only shows for everyone else.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Box, Button, LinearProgress, Paper, Skeleton, Typography } from '@neram/ui';
import { alpha } from '@mui/material/styles';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import OnboardingChecklist from '@/components/post-enrollment/OnboardingChecklist';
import { classSetupIdToken } from './ClassSetupGuide';

type Summary =
  | { ready: true; count: number; total: number }
  | { ready: false; pending: { stage: 'checking' | 'account' } | null };

export default function ClassSetupCard() {
  const [summary, setSummary] = useState<Summary | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await classSetupIdToken();
        if (!token) return setSummary(null);
        const res = await fetch('/api/class-setup?summary=1', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const json = res.ok ? await res.json() : null;
        if (!cancelled) setSummary((json?.data as Summary) ?? null);
      } catch {
        if (!cancelled) setSummary(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (summary === undefined) return <Skeleton variant="rounded" height={112} sx={{ mb: 2, borderRadius: 3 }} />;
  if (!summary || (!summary.ready && !summary.pending)) return <OnboardingChecklist />;
  if (summary.ready && summary.count >= summary.total) return null;

  const pending = !summary.ready;
  const title = pending ? 'Your class account is on its way' : 'Finish your class setup';
  const detail = pending
    ? summary.pending?.stage === 'checking'
      ? 'We are checking your payment.'
      : 'We are making your class account.'
    : `${summary.count} of ${summary.total} done. About 10 minutes on your phone.`;

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, mb: 2, borderRadius: 3, borderColor: 'primary.main', bgcolor: (t) => alpha(t.palette.primary.main, 0.04) }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box
          aria-hidden
          sx={{
            flexShrink: 0,
            width: 40,
            height: 40,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
            color: 'primary.main',
          }}
        >
          {pending ? <HourglassTopIcon /> : <RocketLaunchIcon />}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h2" sx={{ fontWeight: 700, fontSize: 16, lineHeight: 1.35 }}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {detail}
          </Typography>
        </Box>
      </Box>
      {summary.ready && (
        <LinearProgress
          variant="determinate"
          value={(summary.count / summary.total) * 100}
          aria-label={`${summary.count} of ${summary.total} setup steps done`}
          sx={{ mt: 1.5, height: 8, borderRadius: 4 }}
        />
      )}
      <Button
        component={Link}
        href="/onboarding"
        variant={pending ? 'outlined' : 'contained'}
        fullWidth
        sx={{ mt: 1.5, minHeight: 48, textTransform: 'none', fontWeight: 700 }}
      >
        {pending ? 'See where you are' : summary.count > 0 ? 'Continue' : 'Start'}
      </Button>
    </Paper>
  );
}
