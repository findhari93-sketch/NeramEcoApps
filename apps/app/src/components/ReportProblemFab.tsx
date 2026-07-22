'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Fab, Tooltip, CircularProgress } from '@neram/ui';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import { getCurrentUser } from '@neram/auth';
import { captureScreenshot } from '@/lib/capture-screenshot';
import ReportProblemDialog from './ReportProblemDialog';

/**
 * Persistent "Report a problem" floating button on every authenticated page.
 * Captures a screenshot before opening the dialog, which also attaches device
 * info + recent console/network errors automatically. Hidden on /support (that
 * page has its own support entry point).
 */
export default function ReportProblemFab() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [autoShot, setAutoShot] = useState<File | null>(null);

  const getToken = async (): Promise<string | null> => {
    const u = getCurrentUser();
    return u ? await u.getIdToken() : null;
  };

  if (pathname?.startsWith('/support')) return null;

  const handleClick = async () => {
    if (capturing || open) return;
    setCapturing(true);
    const shot = await captureScreenshot();
    setAutoShot(shot);
    setCapturing(false);
    setOpen(true);
  };

  return (
    <>
      <Tooltip title="Report a problem" placement="left">
        <Fab
          color="primary"
          size="medium"
          aria-label="Report a problem"
          onClick={handleClick}
          disabled={capturing}
          data-no-screenshot="true"
          sx={{
            position: 'fixed',
            right: 16,
            bottom: { xs: 80, sm: 32 },
            zIndex: (t) => t.zIndex.speedDial,
          }}
        >
          {capturing ? <CircularProgress size={22} color="inherit" /> : <BugReportOutlinedIcon />}
        </Fab>
      </Tooltip>
      <ReportProblemDialog
        open={open}
        onClose={() => {
          setOpen(false);
          setAutoShot(null);
        }}
        getToken={getToken}
        pageUrl={pathname || undefined}
        initialScreenshotFile={autoShot}
      />
    </>
  );
}
