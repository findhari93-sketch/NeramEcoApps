'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Box, Button, CircularProgress, IconButton, InputAdornment, Paper, Stack, TextField, Typography } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { getSupabaseBrowserClient } from '@neram/database';

type Step = 'checking' | 'password' | 'failed';

/**
 * /college-dashboard/welcome?token_hash=..&type=invite|magiclink
 * The link from an invite or "Email me a sign-in link". Verifies the one-time
 * token, then asks the person to choose a password so next time they can sign
 * in with email and password.
 */
function Welcome() {
  const params = useSearchParams();
  const router = useRouter();
  const [step, setStep] = useState<Step>('checking');
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const token_hash = params.get('token_hash');
    const type = params.get('type') === 'invite' ? 'invite' : 'magiclink';
    if (!token_hash) {
      setStep('failed');
      setError('This link is incomplete. Open the link from your email again.');
      return;
    }
    const supabase = getSupabaseBrowserClient();
    supabase.auth
      .verifyOtp({ token_hash, type })
      .then(({ error: e }) => {
        if (e) {
          setStep('failed');
          setError('This link has expired or was already used. Ask for a new one below or from the person who invited you.');
        } else {
          setStep('password');
        }
      });
  }, [params]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError('The two passwords do not match.');
    setSaving(true);
    setError('');
    const { error: e2 } = await getSupabaseBrowserClient().auth.updateUser({ password });
    setSaving(false);
    if (e2) return setError(e2.message);
    router.replace('/college-dashboard');
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.50', px: 2, py: 4 }}>
      <Paper variant="outlined" sx={{ width: '100%', maxWidth: 420, p: { xs: 3, sm: 4 }, borderRadius: 3 }}>
        <Typography variant="h1" sx={{ fontSize: 22, fontWeight: 700, mb: 1 }}>
          Welcome to your college dashboard
        </Typography>
        {step === 'checking' && (
          <Stack direction="row" gap={1.5} alignItems="center" sx={{ color: 'text.secondary' }} aria-live="polite">
            <CircularProgress size={18} /> Checking your link
          </Stack>
        )}
        {step === 'failed' && (
          <>
            <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>
            <Button href="/college-dashboard/login" variant="contained" fullWidth sx={{ minHeight: 48 }}>
              Go to sign in
            </Button>
          </>
        )}
        {step === 'password' && (
          <form onSubmit={save} noValidate>
            <Typography sx={{ color: 'text.secondary', mb: 2.5, fontSize: 15 }}>
              Choose a password. You will use it with your email to sign in next time.
            </Typography>
            <Stack gap={2}>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField
                label="New password"
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                helperText="At least 8 characters"
                autoFocus
                fullWidth
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShow((v) => !v)} edge="end" aria-label={show ? 'Hide password' : 'Show password'} sx={{ width: 44, height: 44 }}>
                        {show ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                label="Type it again"
                type={show ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                fullWidth
              />
              <Button type="submit" variant="contained" disabled={saving} sx={{ minHeight: 48, fontWeight: 700 }}>
                {saving ? 'Saving' : 'Save and open the dashboard'}
              </Button>
            </Stack>
          </form>
        )}
      </Paper>
    </Box>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={null}>
      <Welcome />
    </Suspense>
  );
}
