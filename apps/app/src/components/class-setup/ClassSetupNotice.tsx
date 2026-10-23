'use client';

/**
 * The two /onboarding screens that are not the guide itself: the setup could
 * not be loaded (try again), or the person has not enrolled yet (apply first).
 * Neither falls back to the older onboarding, which no longer exists.
 */
import { useState } from 'react';
import Link from 'next/link';
import { Box, Button, Paper, Typography } from '@neram/ui';
import { alpha } from '@mui/material/styles';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import RefreshIcon from '@mui/icons-material/Refresh';
import SchoolIcon from '@mui/icons-material/School';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';

const HELP_URL = `https://wa.me/916380194614?text=${encodeURIComponent('Hi, I need help with my class setup at Neram Classes.')}`;

export default function ClassSetupNotice({
  kind,
  onRetry,
}: {
  kind: 'error' | 'not-enrolled';
  /** Load the setup again. Only used for `error`. */
  onRetry?: () => Promise<void>;
}) {
  const [retrying, setRetrying] = useState(false);
  const failed = kind === 'error';

  const retry = async () => {
    if (!onRetry) return;
    setRetrying(true);
    await onRetry();
    setRetrying(false);
  };

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', px: 2, py: { xs: 2, sm: 3 } }}>
      <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 3, textAlign: 'center' }}>
        <Box
          aria-hidden
          sx={{
            width: 56,
            height: 56,
            mx: 'auto',
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
            color: 'primary.main',
          }}
        >
          {failed ? <CloudOffIcon /> : <SchoolIcon />}
        </Box>
        <Typography component="h1" variant="h6" fontWeight={800} sx={{ mt: 1.5 }}>
          {failed ? 'Could not load your class setup' : 'Your class setup starts after you enrol'}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
          {failed
            ? 'Check your internet connection and try again.'
            : 'Once your enrolment is confirmed, your class account and five quick setup steps appear here.'}
        </Typography>

        <Box sx={{ mt: 2.5, display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
          {failed ? (
            <Button
              variant="contained"
              onClick={retry}
              disabled={retrying}
              startIcon={<RefreshIcon />}
              sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
            >
              {retrying ? 'Trying again' : 'Try again'}
            </Button>
          ) : (
            <Button
              component={Link}
              href="/my-applications"
              variant="contained"
              sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
            >
              See my application
            </Button>
          )}
          <Button
            variant="outlined"
            color="success"
            href={HELP_URL}
            target="_blank"
            rel="noopener noreferrer"
            startIcon={<WhatsAppIcon />}
            sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
          >
            Message us
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
