'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Fab, Tooltip, CircularProgress } from '@neram/ui';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import { getCurrentUser } from '@neram/auth';
import { captureScreenshot } from '@/lib/capture-screenshot';
import ReportProblemDialog from './ReportProblemDialog';
import { useCanReportProblem, useReportFabHidden } from './ReporterAccessContext';
import { BOTTOM_NAV_HEIGHT } from './shell/MobileBottomNav';

/**
 * "Report a problem" floating button, shown to everyone signed in. Captures a
 * picture of the page before opening the dialog, which also attaches device
 * info and recent console/network errors automatically.
 *
 * Hidden on /support (that page has its own "New request" entry point) and on
 * screens that ask for it with useHideReportFab() because they own the bottom
 * of the screen.
 *
 * Placement: below md the phone tab bar is showing, so the button sits 16px
 * above it, clear of the iPhone home indicator. From md up there is no tab bar.
 */
export default function ReportProblemFab() {
  const pathname = usePathname();
  const canReport = useCanReportProblem();
  const hiddenBelow = useReportFabHidden();
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [autoShot, setAutoShot] = useState<File | null>(null);

  const getToken = async (): Promise<string | null> => {
    const u = getCurrentUser();
    return u ? await u.getIdToken() : null;
  };

  if (!canReport) return null;
  if (pathname?.startsWith('/support')) return null;
  if (hiddenBelow === 'all' && !open) return null;

  const handleClick = async () => {
    if (capturing || open) return;
    setCapturing(true);
    const shot = await captureScreenshot();
    setAutoShot(shot);
    setCapturing(false);
    setOpen(true);
  };

  const display =
    hiddenBelow === 'md'
      ? { xs: 'none', md: 'inline-flex' }
      : hiddenBelow === 'sm'
        ? { xs: 'none', sm: 'inline-flex' }
        : 'inline-flex';

  return (
    <>
      {hiddenBelow !== 'all' && (
        <Tooltip title="Report a problem" placement="left">
          <Fab
            color="primary"
            aria-label="Report a problem"
            aria-busy={capturing || undefined}
            onClick={handleClick}
            disabled={capturing}
            data-no-screenshot="true"
            data-testid="report-problem-fab"
            sx={{
              display,
              position: 'fixed',
              width: 48,
              height: 48,
              minHeight: 48,
              right: 16,
              bottom: {
                xs: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px) + 16px)`,
                md: 24,
              },
              zIndex: (t) => t.zIndex.speedDial,
              '&:focus-visible': {
                outline: '3px solid',
                outlineColor: 'primary.light',
                outlineOffset: 2,
              },
            }}
          >
            {capturing ? <CircularProgress size={22} color="inherit" /> : <BugReportOutlinedIcon />}
          </Fab>
        </Tooltip>
      )}
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
