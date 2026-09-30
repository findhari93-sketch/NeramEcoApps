'use client';

import { useEffect, useState } from 'react';
import { Box, Button, Stack, Typography } from '@neram/ui';
import RefreshIcon from '@mui/icons-material/Refresh';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';

const TAP = 48;

/** How long a spinner may run before a student is offered a way out. */
export const SLOW_START_MS = 12_000;

interface SlowStartHelpProps {
  /** Where /help's Back and Done should return to. */
  from: string;
  delayMs?: number;
}

/**
 * Shown under a start-up spinner once it has run for SLOW_START_MS. Before this
 * the spinner had no timeout, so a sign-in that never settled looked exactly
 * like a frozen app, with nothing to tap.
 */
export default function SlowStartHelp({ from, delayMs = SLOW_START_MS }: SlowStartHelpProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShow(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  if (!show) return null;

  return (
    <Box role="status" sx={{ mt: 3, maxWidth: 360, width: '100%', mx: 'auto', textAlign: 'center', px: 2 }}>
      <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.5 }}>
        This is taking longer than usual
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
        A slow or blocked network is the usual cause. Try again, or tell us and we will help.
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button
          variant="contained"
          fullWidth
          startIcon={<RefreshIcon />}
          onClick={() => window.location.reload()}
          sx={{ minHeight: TAP, textTransform: 'none' }}
        >
          Try again
        </Button>
        <Button
          component="a"
          href={`/help?problem=cant_open&from=${encodeURIComponent(from)}`}
          variant="outlined"
          fullWidth
          startIcon={<SupportAgentOutlinedIcon />}
          sx={{ minHeight: TAP, textTransform: 'none' }}
        >
          Get help
        </Button>
      </Stack>
    </Box>
  );
}
