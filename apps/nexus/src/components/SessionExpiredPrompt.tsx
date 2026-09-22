'use client';

import { useEffect, useState } from 'react';
import { Alert, AlertTitle, Box, Button, IconButton, Snackbar } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

/**
 * Tells the user their Microsoft session has expired, and lets them pick the moment
 * to sign in again.
 *
 * A background poll used to answer an expired session by sending the whole page to
 * Microsoft on its own, taking a half-written review or answer with it (PERF-0054).
 * Now the pollers stay quiet and this appears instead:
 * - It never takes focus, and it is announced politely (role="status"), so someone
 *   typing keeps their cursor and their words.
 * - It sits above the phone BottomNav and below nothing that matters on a laptop.
 * - It stays until acted on or dismissed: this is a state to act on, not a toast.
 * - Info, not warning: the theme's warning Alert is under 4.5:1 contrast.
 */
export default function SessionExpiredPrompt() {
  const { sessionExpired, renewSession } = useNexusAuthContext();
  const [dismissed, setDismissed] = useState(false);
  const [renewing, setRenewing] = useState(false);

  // A later expiry, after a successful renewal, shows the prompt again.
  useEffect(() => {
    if (!sessionExpired) setDismissed(false);
  }, [sessionExpired]);

  const signInAgain = async () => {
    setRenewing(true);
    try {
      // Normally navigates to Microsoft and does not come back here.
      await renewSession();
    } finally {
      setRenewing(false);
    }
  };

  return (
    <Snackbar
      open={sessionExpired && !dismissed}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      sx={{
        // Clear of the phone BottomNav (64px) and the home indicator.
        bottom: { xs: 'calc(72px + env(safe-area-inset-bottom))', md: 24 },
      }}
    >
      <Alert
        severity="info"
        role="status"
        aria-live="polite"
        sx={{ width: '100%', maxWidth: 560, boxShadow: 3 }}
        // Only the 44px Dismiss sits in the action slot. With the main button there
        // too, a 375px phone squeezed the message into a narrow column.
        action={
          <IconButton
            color="inherit"
            aria-label="Dismiss"
            onClick={() => setDismissed(true)}
            sx={{ width: 44, height: 44 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        }
      >
        <AlertTitle sx={{ mb: 0.25 }}>Your session has expired</AlertTitle>
        Signing in again opens the Microsoft page. Copy anything you are typing first so it is not lost.
        <Box sx={{ mt: 1 }}>
          <Button
            variant="outlined"
            color="inherit"
            onClick={signInAgain}
            disabled={renewing}
            sx={{ minHeight: 44, fontWeight: 700, textTransform: 'none' }}
          >
            Sign in again
          </Button>
        </Box>
      </Alert>
    </Snackbar>
  );
}
