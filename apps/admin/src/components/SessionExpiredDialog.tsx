'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@neram/ui';
import LockClockOutlinedIcon from '@mui/icons-material/LockClockOutlined';
import { getActiveAccount, getMsalInstance, initializeMsal, loginScopes } from '@neram/auth';
import { finishReauth, subscribeReauth } from '@/lib/admin-reauth';

/** Plain words for the ways a popup sign-in can stop short. */
function describeFailure(error: unknown): string {
  const code = (error as { errorCode?: string })?.errorCode ?? '';
  if (code === 'popup_window_error' || code === 'empty_window_error') {
    return 'Your browser blocked the Microsoft sign-in window. Allow pop-ups for this site, then press Sign in again.';
  }
  if (code === 'user_cancelled') {
    return 'The sign-in window was closed before it finished. Press Sign in again to try once more.';
  }
  if (code === 'interaction_in_progress') {
    return 'A Microsoft sign-in is already open in another window or tab. Finish or close it, then press Sign in again.';
  }
  return 'Microsoft sign-in did not finish. Press Sign in again to retry.';
}

/**
 * Shown when the dashboard can no longer get a Microsoft token silently. A popup,
 * not a redirect, so nothing typed on the page is lost: the calls that were
 * waiting go through with the new token as soon as sign-in finishes.
 */
export default function SessionExpiredDialog() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      subscribeReauth((next) => {
        setOpen(next);
        if (next) {
          setError(null);
          setBusy(false);
        }
      }),
    [],
  );

  const account = open ? getActiveAccount() : null;

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      // MSAL is initialised long before this dialog can open; the await is only
      // a guard, and it resolves in the same click so the popup is not blocked.
      await initializeMsal();
      const msal = getMsalInstance();
      const current = getActiveAccount();
      const result = await msal.acquireTokenPopup({
        scopes: loginScopes.default,
        ...(current ? { account: current, loginHint: current.username } : { prompt: 'select_account' }),
      });
      if (result.account) msal.setActiveAccount(result.account);
      finishReauth(result.accessToken);
    } catch (e) {
      setError(describeFailure(e));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : () => finishReauth(null)}
      maxWidth="xs"
      fullWidth
      aria-labelledby="session-expired-title"
      aria-describedby="session-expired-body"
    >
      <DialogTitle id="session-expired-title" sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <LockClockOutlinedIcon color="primary" aria-hidden />
        Sign in again to keep working
      </DialogTitle>
      <DialogContent>
        <Typography id="session-expired-body" variant="body2" sx={{ mb: 1.5 }}>
          Your Microsoft sign-in for the admin dashboard has expired. Sign in again and the change you just
          made will go through. Anything you typed on this page stays as it is.
        </Typography>
        {account?.username && (
          <Typography variant="body2" color="text.secondary">
            Account: {account.username}
          </Typography>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }} role="alert">
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={() => finishReauth(null)} disabled={busy} sx={{ minHeight: 44 }}>
          Not now
        </Button>
        <Button
          variant="contained"
          onClick={signIn}
          disabled={busy}
          autoFocus
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ minHeight: 44 }}
        >
          {busy ? 'Waiting for Microsoft' : 'Sign in again'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
