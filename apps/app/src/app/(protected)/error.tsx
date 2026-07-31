'use client';

import { useEffect, useState } from 'react';
import { Box, Typography, Button, Stack } from '@neram/ui';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import RefreshIcon from '@mui/icons-material/Refresh';
import { getCurrentUser } from '@neram/auth';
import { recordError } from '@/lib/error-buffer';
import { captureScreenshot } from '@/lib/capture-screenshot';
import ReportProblemDialog from '@/components/ReportProblemDialog';
import { useCanReportProblem } from '@/components/ReporterAccessContext';

/**
 * Error boundary for any uncaught render error under (protected). Shows a
 * friendly screen (never the raw error) with a one-tap "Report this issue"
 * for enrolled students, and a link to Support for everyone else, who cannot
 * file a report and would otherwise hit a 403.
 */
export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [autoShot, setAutoShot] = useState<File | null>(null);
  const canReport = useCanReportProblem();

  const getToken = async (): Promise<string | null> => {
    const u = getCurrentUser();
    return u ? await u.getIdToken() : null;
  };

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
        {canReport ? (
          <Button
            variant="contained"
            startIcon={<BugReportOutlinedIcon />}
            onClick={handleReport}
            sx={{ textTransform: 'none' }}
          >
            Report this issue
          </Button>
        ) : (
          <Button
            variant="contained"
            startIcon={<SupportAgentIcon />}
            href="/support"
            sx={{ textTransform: 'none' }}
          >
            Contact support
          </Button>
        )}
      </Stack>

      {canReport && (
        <ReportProblemDialog
          open={open}
          onClose={() => {
            setOpen(false);
            setAutoShot(null);
          }}
          getToken={getToken}
          initialScreenshotFile={autoShot}
          prefill={{ category: 'technical_issue', title: 'Something went wrong on this page' }}
        />
      )}
    </Box>
  );
}
