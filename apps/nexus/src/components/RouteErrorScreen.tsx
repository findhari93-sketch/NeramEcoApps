'use client';

import { useEffect, useState } from 'react';
import { Box, Button, Stack, Typography } from '@neram/ui';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { recordError } from '@/lib/error-buffer';
import { captureScreenshot } from '@/lib/capture-screenshot';
import { clearPersistentCache } from '@/lib/swr-cache';
import { clearCachedAuth } from '@/lib/auth-cache';
import ReportIssueDialog from '@/components/issues/ReportIssueDialog';

/** Comfortably over the 44px minimum, and the 48px this repo asks for. */
const TAP = 48;

interface RouteErrorScreenProps {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
  body: string;
  /** Prefilled title of the issue report. */
  reportTitle: string;
  /** Centre on the whole viewport: for a boundary that has no shell around it. */
  fullScreen?: boolean;
}

/**
 * The crash screen for the root and parent error boundaries (PERF-0028), built
 * like (teacher)/error.tsx: announced, never showing the raw error, with Try again
 * and a way out of a crash loop that reset() alone cannot break.
 */
export default function RouteErrorScreen({ error, reset, title, body, reportTitle, fullScreen = false }: RouteErrorScreenProps) {
  const { user, nexusRole, getToken } = useNexusAuthContext();
  // The issue route takes a staff or student token only, so a parent, or someone
  // not signed in yet, would be offered a button that cannot work.
  const canReport = !!user && nexusRole !== 'parent';
  const [open, setOpen] = useState(false);
  const [autoShot, setAutoShot] = useState<File | null>(null);

  // Into the buffer, so a report carries the actual crash rather than a description.
  useEffect(() => {
    recordError({
      message: `Page crashed: ${error.message}${error.digest ? ` (digest ${error.digest})` : ''}`,
      stack: error.stack || null,
    });
  }, [error]);

  const handleReport = async () => {
    const shot = await captureScreenshot();
    setAutoShot(shot);
    setOpen(true);
  };

  /**
   * Nexus paints from data saved on the device, so when that data is what crashed
   * the screen, trying again finds it again. Dropping it (the screens' cache and the
   * saved sign-in shell) breaks the loop at the cost of one slower start. It does not
   * sign anyone out.
   */
  const handleClearAndReload = () => {
    clearPersistentCache();
    clearCachedAuth();
    window.location.reload();
  };

  return (
    <Box
      // Announced, not merely coloured: a screen reader gets told the page failed.
      role="alert"
      sx={{
        minHeight: fullScreen ? '100dvh' : '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 2,
        px: 3,
        py: 4,
      }}
    >
      <ErrorOutlineIcon sx={{ fontSize: 56, color: 'warning.main' }} />

      <Typography variant="h6" component="h1" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>

      <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 440, lineHeight: 1.6 }}>
        {body}
      </Typography>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ mt: 1, width: { xs: '100%', sm: 'auto' }, maxWidth: 360 }}
      >
        <Button
          variant="contained"
          startIcon={<RefreshIcon />}
          onClick={() => reset()}
          sx={{ textTransform: 'none', minHeight: TAP, px: 3 }}
        >
          Try again
        </Button>
        {canReport && (
          <Button
            variant="outlined"
            startIcon={<BugReportOutlinedIcon />}
            onClick={handleReport}
            sx={{ textTransform: 'none', minHeight: TAP, px: 3 }}
          >
            Report this issue
          </Button>
        )}
      </Stack>

      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 0.5 }}>
          Still broken after trying again?
        </Typography>
        <Button
          size="small"
          onClick={handleClearAndReload}
          sx={{ textTransform: 'none', minHeight: TAP, color: 'text.secondary' }}
        >
          Clear this device&apos;s saved data and reload
        </Button>
      </Box>

      {canReport && (
        <ReportIssueDialog
          open={open}
          onClose={() => {
            setOpen(false);
            setAutoShot(null);
          }}
          getToken={getToken}
          initialScreenshotFile={autoShot}
          prefill={{ category: 'bug', title: reportTitle }}
        />
      )}
    </Box>
  );
}
