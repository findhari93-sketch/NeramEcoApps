'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Paper, Typography, TextField, Button, Alert, Stack, InputAdornment, IconButton, Divider,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { getSupabaseBrowserClient } from '@neram/database';

type Mode = 'password' | 'link' | 'request';

export default function CollegeDashboardLoginPage() {
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [req, setReq] = useState({ college_name: '', name: '', designation: '', phone: '', message: '', website: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const router = useRouter();

  // "Claim profile" on a college page links here with ?request=1.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('request') === '1') setMode('request');
  }, []);

  const switchTo = (m: Mode) => {
    setMode(m);
    setError('');
    setDone('');
    setFieldErrors({});
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return setError('Enter your email and password.');
    setBusy(true);
    setError('');
    const { error: authError } = await getSupabaseBrowserClient().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (authError) {
      setError(
        authError.message === 'Invalid login credentials'
          ? 'Incorrect email or password. Use "Email me a sign-in link" if you forgot it.'
          : authError.message
      );
      return;
    }
    router.push('/college-dashboard');
  };

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return setError('Enter your email.');
    setBusy(true);
    setError('');
    await fetch('/api/college-dashboard/sign-in-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    setBusy(false);
    setDone('If this email has a college account, a sign-in link is on its way. Check your inbox and spam folder.');
  };

  const sendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFieldErrors({});
    const res = await fetch('/api/college-dashboard/account-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...req, email }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) {
      setFieldErrors(json.fields ?? {});
      return setError(json.error ?? 'Could not send the request. Please try again.');
    }
    setDone('Thanks. The Neram Classes team will check your request and email you a link to set up your account.');
  };

  const title = mode === 'password' ? 'Sign in' : mode === 'link' ? 'Get a sign-in link' : 'Request an account';

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.50', px: 2, py: 4 }}>
      <Paper variant="outlined" sx={{ width: '100%', maxWidth: 440, p: { xs: 3, sm: 4 }, borderRadius: 3 }}>
        <Typography component="p" sx={{ m: 0, fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'primary.main' }}>
          Neram Classes College Hub
        </Typography>
        <Typography variant="h1" sx={{ mt: 0.5, mb: 1, fontSize: 24, fontWeight: 700 }}>
          {title}
        </Typography>
        <Typography sx={{ color: 'text.secondary', mb: 2.5, fontSize: 15 }}>
          {mode === 'request'
            ? 'For college staff. Tell us who you are and we will set up access for your college.'
            : 'Manage your college page, admission enquiries and reviews.'}
        </Typography>

        {done ? (
          <Stack gap={2}>
            <Alert severity="success">{done}</Alert>
            <Button variant="outlined" onClick={() => switchTo('password')} sx={{ minHeight: 44 }}>
              Back to sign in
            </Button>
          </Stack>
        ) : (
          <form onSubmit={mode === 'password' ? handleLogin : mode === 'link' ? sendLink : sendRequest} noValidate>
            <Stack gap={2}>
              {error && <Alert severity="error">{error}</Alert>}
              {mode === 'request' && (
                <>
                  <TextField label="College name" value={req.college_name} onChange={(e) => setReq({ ...req, college_name: e.target.value })} error={!!fieldErrors.college_name} helperText={fieldErrors.college_name} fullWidth required />
                  <TextField label="Your name" value={req.name} onChange={(e) => setReq({ ...req, name: e.target.value })} error={!!fieldErrors.name} helperText={fieldErrors.name} autoComplete="name" fullWidth required />
                  <TextField label="Your role at the college" value={req.designation} onChange={(e) => setReq({ ...req, designation: e.target.value })} placeholder="For example Principal, Admissions officer" fullWidth />
                </>
              )}
              <TextField
                label="Work email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={!!fieldErrors.email}
                helperText={fieldErrors.email}
                fullWidth
                autoComplete="email"
                autoFocus={mode !== 'request'}
                required
              />
              {mode === 'password' && (
                <TextField
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  fullWidth
                  autoComplete="current-password"
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPassword((v) => !v)} edge="end" aria-label={showPassword ? 'Hide password' : 'Show password'} sx={{ width: 44, height: 44 }}>
                          {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              )}
              {mode === 'request' && (
                <>
                  <TextField label="Phone (optional)" value={req.phone} onChange={(e) => setReq({ ...req, phone: e.target.value })} error={!!fieldErrors.phone} helperText={fieldErrors.phone} inputProps={{ inputMode: 'tel' }} autoComplete="tel" fullWidth />
                  <TextField label="Anything we should know? (optional)" value={req.message} onChange={(e) => setReq({ ...req, message: e.target.value })} multiline minRows={2} fullWidth />
                  <Box aria-hidden sx={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>
                    <input tabIndex={-1} autoComplete="off" value={req.website} onChange={(e) => setReq({ ...req, website: e.target.value })} />
                  </Box>
                </>
              )}
              <Button type="submit" variant="contained" disabled={busy} sx={{ minHeight: 48, fontWeight: 700 }}>
                {busy ? 'Please wait' : mode === 'password' ? 'Sign in' : mode === 'link' ? 'Email me a sign-in link' : 'Send request'}
              </Button>
            </Stack>
          </form>
        )}

        {!done && (
          <>
            <Divider sx={{ my: 2.5 }} />
            <Stack gap={0.5}>
              {mode !== 'password' && (
                <Button onClick={() => switchTo('password')} sx={{ minHeight: 44, textTransform: 'none', justifyContent: 'flex-start' }}>
                  Sign in with a password
                </Button>
              )}
              {mode !== 'link' && (
                <Button onClick={() => switchTo('link')} sx={{ minHeight: 44, textTransform: 'none', justifyContent: 'flex-start' }}>
                  Forgot your password? Email me a sign-in link
                </Button>
              )}
              {mode !== 'request' && (
                <Button onClick={() => switchTo('request')} sx={{ minHeight: 44, textTransform: 'none', justifyContent: 'flex-start' }}>
                  No account yet? Request one for your college
                </Button>
              )}
            </Stack>
          </>
        )}
      </Paper>
    </Box>
  );
}
