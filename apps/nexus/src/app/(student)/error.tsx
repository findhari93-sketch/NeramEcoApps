'use client';

import { useEffect, useState } from 'react';
import { Box, Typography, Button, Stack } from '@neram/ui';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { recordError } from '@/lib/error-buffer';
import { captureScreenshot } from '@/lib/capture-screenshot';
import ReportIssueDialog from '@/components/issues/ReportIssueDialog';

/**
 * Student-facing error boundary for any uncaught render error under (student).
 * Shows a friendly screen (never the raw error) with a one-tap "Report this
 * issue" that attaches the crash + a screenshot + device/console context.
 */
export default function StudentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { getToken } = useNexusAuthContext();
  const [open, setOpen] = useState(false);
  const [autoShot, setAutoShot] = useState<File | null>(null);

  // Record the crash into the buffer so it's attached to whatever the student reports.
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

  return (
    <Box
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
      <Typography variant="h6" sx={{ fontWeight: 700 }}>
        Something went wrong
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 420 }}>
        We hit an unexpected error on this page. You can try again, or report it so we can fix it
        quickly.
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 1, width: { xs: '100%', sm: 'auto' } }}>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => reset()} sx={{ textTransform: 'none' }}>
          Try again
        </Button>
        <Button
          variant="contained"
          startIcon={<BugReportOutlinedIcon />}
          onClick={handleReport}
          sx={{ textTransform: 'none' }}
        >
          Report this issue
        </Button>
      </Stack>

      <ReportIssueDialog
        open={open}
        onClose={() => {
          setOpen(false);
          setAutoShot(null);
        }}
        getToken={getToken}
        initialScreenshotFile={autoShot}
        prefill={{ category: 'bug', title: 'Something went wrong on this page' }}
      />
    </Box>
  );
}
