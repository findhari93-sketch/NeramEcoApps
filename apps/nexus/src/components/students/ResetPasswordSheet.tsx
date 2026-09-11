'use client';

import { useEffect, useState } from 'react';
import { Alert, Box, Button, Drawer, IconButton, Typography } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import LockResetOutlinedIcon from '@mui/icons-material/LockResetOutlined';
import StudentAvatar from './StudentAvatar';
import AccountShareCard, { UnsharedPasswordDialog } from './AccountShareCard';

export interface ResetPasswordTarget {
  id: string;
  name: string;
}

interface ResetResult {
  upn: string;
  password: string;
  firstName: string;
  phone: string | null;
}

/**
 * Reset a student's Microsoft password and hand them the new one.
 *
 * One confirmation first, because a reset locks the student out of Teams and
 * Nexus until the new password reaches them. Then the same share card a new
 * account gets: copy, send on WhatsApp, shown once.
 */
export default function ResetPasswordSheet({
  target,
  getToken,
  onClose,
}: {
  target: ResetPasswordTarget | null;
  getToken: () => Promise<string | null>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; fix?: string | null } | null>(null);
  const [result, setResult] = useState<ResetResult | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  // Every student starts from the confirmation, never from someone else's password.
  useEffect(() => {
    setBusy(false);
    setError(null);
    setResult(null);
    setPending(false);
    setConfirmClose(false);
  }, [target?.id]);

  const requestClose = () => {
    if (busy) return;
    if (result && pending) setConfirmClose(true);
    else onClose();
  };

  const reset = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/students/${target.id}/reset-password`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        setResult(data as ResetResult);
        setPending(true);
      } else {
        setError({ message: data?.error || 'Could not reset the password.', fix: data?.fix ?? null });
      }
    } catch {
      setError({ message: 'Could not reach Nexus. Check the connection and try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Drawer
        anchor="bottom"
        open={!!target}
        onClose={requestClose}
        PaperProps={{
          role: 'dialog',
          'aria-labelledby': 'reset-password-title',
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: '92dvh',
            width: '100%',
            maxWidth: 640,
            mx: 'auto',
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pt: 1 }}>
          <Typography id="reset-password-title" sx={{ fontWeight: 800, fontSize: '1.1rem', flex: 1 }}>
            Reset password
          </Typography>
          <IconButton onClick={requestClose} aria-label="Close" sx={{ width: 48, height: 48 }}>
            <CloseIcon />
          </IconButton>
        </Box>

        <Box sx={{ p: 2, pt: 1, overflowY: 'auto', pb: 'calc(16px + env(safe-area-inset-bottom))' }}>
          {target &&
            (result ? (
              <AccountShareCard
                kind="reset"
                firstName={result.firstName}
                upn={result.upn}
                password={result.password}
                phone={result.phone}
                onSharedChange={(shared) => setPending(!shared)}
                onDone={onClose}
              />
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <StudentAvatar userId={target.id} name={target.name} size={48} tapToView={false} />
                  <Typography sx={{ fontWeight: 800, minWidth: 0, wordBreak: 'break-word' }}>{target.name}</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Their current password stops working straight away. They sign in with a temporary password and
                  choose a new one, so send it to them as soon as it appears.
                </Typography>
                {error && (
                  <Alert severity="error">
                    {error.message}
                    {error.fix && (
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {error.fix}
                      </Typography>
                    )}
                  </Alert>
                )}
                <Box sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'column', sm: 'row-reverse' } }}>
                  <Button
                    variant="contained"
                    color="warning"
                    startIcon={<LockResetOutlinedIcon />}
                    onClick={() => void reset()}
                    disabled={busy}
                    sx={{ minHeight: 48, fontWeight: 700 }}
                  >
                    {busy ? 'Resetting…' : 'Reset password'}
                  </Button>
                  <Button onClick={requestClose} disabled={busy} sx={{ minHeight: 48 }}>
                    Cancel
                  </Button>
                </Box>
              </Box>
            ))}
        </Box>
      </Drawer>

      <UnsharedPasswordDialog
        open={confirmClose}
        onKeep={() => setConfirmClose(false)}
        onDiscard={() => {
          setConfirmClose(false);
          onClose();
        }}
      />
    </>
  );
}
