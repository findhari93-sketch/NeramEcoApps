'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Fab, Tooltip, CircularProgress } from '@neram/ui';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { captureScreenshot } from '@/lib/capture-screenshot';
import ReportIssueDialog from './issues/ReportIssueDialog';

/**
 * Persistent "Report a problem" floating button, shown on every student page.
 * Captures a screenshot of the page BEFORE opening the dialog (so the dialog
 * itself isn't in frame), then opens the report dialog, which additionally
 * attaches device info + recent console/network errors automatically.
 */
export default function ReportIssueFab() {
  const { getToken, isStudent } = useNexusAuthContext();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [autoShot, setAutoShot] = useState<File | null>(null);

  if (!isStudent) return null;

  const handleClick = async () => {
    if (capturing || open) return;
    setCapturing(true);
    const shot = await captureScreenshot();
    setAutoShot(shot);
    setCapturing(false);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setAutoShot(null);
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
            // Stack above the bottom nav (mobile) and the scroll-to-top FAB.
            bottom: { xs: 128, sm: 32 },
            zIndex: (t) => t.zIndex.speedDial,
          }}
        >
          {capturing ? <CircularProgress size={22} color="inherit" /> : <BugReportOutlinedIcon />}
        </Fab>
      </Tooltip>
      <ReportIssueDialog
        open={open}
        onClose={handleClose}
        getToken={getToken}
        pageUrl={pathname || undefined}
        initialScreenshotFile={autoShot}
      />
    </>
  );
}
