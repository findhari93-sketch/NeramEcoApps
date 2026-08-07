'use client';

/**
 * Error boundary for any uncaught render error under (teacher).
 *
 * There was none until now, so a crash on one teacher screen fell all the way
 * through to app/global-error.tsx, which renders its own <html> and replaces the
 * entire document: no sidebar, no nav, no way to any other page, and copy written
 * for students telling a teacher to "let your teacher know". That is what a
 * teacher saw when /teacher/catch-up read `totals.byBucket.run_over` off a payload
 * cached before `byBucket` existed.
 *
 * Sitting here instead means (teacher)/layout.tsx survives. The crash is contained
 * to the page body, the teacher keeps their navigation, and one broken screen no
 * longer costs them the app.
 */

import { useEffect, useState } from 'react';
import { Box, Button, Stack, Typography } from '@neram/ui';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { recordError } from '@/lib/error-buffer';
import { captureScreenshot } from '@/lib/capture-screenshot';
import { clearPersistentCache } from '@/lib/swr-cache';
import ReportIssueDialog from '@/components/issues/ReportIssueDialog';

/** Comfortably over the 44px minimum, and the 48px this repo asks for. */
const TAP = 48;

export default function TeacherError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { getToken } = useNexusAuthContext();
  const [open, setOpen] = useState(false);
  const [autoShot, setAutoShot] = useState<File | null>(null);

  // Into the buffer, so whatever the teacher reports carries the actual crash
  // rather than their description of it.
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
   * The escape hatch `reset()` cannot provide.
   *
   * Nexus paints from a cache on the device (lib/swr-cache.ts), so when the thing
   * that crashed the page is the cached payload itself, re-rendering finds the
   * same poison and lands straight back here. Dropping the cache first is the only
   * action that breaks that loop, and it costs nothing but one cold screen.
   */
  const handleClearCache = () => {
    clearPersistentCache();
    window.location.reload();
  };

  return (
    <Box
      // Announced, not merely coloured: a screen reader gets told the page failed.
      role="alert"
      sx={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 2,
        px: 3,
      }}
    >
      <ErrorOutlineIcon sx={{ fontSize: 56, color: 'warning.main' }} />

      <Typography variant="h6" component="h1" sx={{ fontWeight: 700 }}>
        This page hit an error
      </Typography>

      {/* Says what still works, because the nav beside them is the proof. */}
      <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 440, lineHeight: 1.6 }}>
        Only this page stopped. The rest of Nexus is fine, so you can carry on from the menu. Try
        again first, and report it if it keeps happening.
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
        <Button
          variant="outlined"
          startIcon={<BugReportOutlinedIcon />}
          onClick={handleReport}
          sx={{ textTransform: 'none', minHeight: TAP, px: 3 }}
        >
          Report this issue
        </Button>
      </Stack>

      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 0.5 }}>
          Still broken after trying again?
        </Typography>
        <Button
          size="small"
          onClick={handleClearCache}
          sx={{ textTransform: 'none', minHeight: TAP, color: 'text.secondary' }}
        >
          Clear this device&apos;s saved data and reload
        </Button>
      </Box>

      <ReportIssueDialog
        open={open}
        onClose={() => {
          setOpen(false);
          setAutoShot(null);
        }}
        getToken={getToken}
        initialScreenshotFile={autoShot}
        prefill={{ category: 'bug', title: 'A teacher page crashed' }}
      />
    </Box>
  );
}
