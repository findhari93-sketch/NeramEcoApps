'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box, Paper, Typography, TextField, Button, Alert,
  CircularProgress, Stack,
} from '@mui/material';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';

export default function StaffLoginPage() {
  return (
    <Suspense fallback={<Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress /></Box>}>
      <StaffLoginForm />
    </Suspense>
  );
}

function StaffLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get('next') || '/colleges';

  const [secret, setSecret] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!secret || !name || !email) {
      setError('All fields are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/staff-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, name, email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }
      router.push(nextUrl);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'grey.50',
        px: 2,
      }}
    >
      <Paper
        elevation={0}
        variant="outlined"
        sx={{ width: '100%', maxWidth: 420, p: { xs: 3, sm: 4 }, borderRadius: 3 }}
      >
        <Stack alignItems="center" gap={1} sx={{ mb: 3 }}>
          <Box
            sx={{
              width: 52, height: 52, bgcolor: '#0f172a',
              borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <AdminPanelSettingsIcon sx={{ color: 'white', fontSize: 28 }} />
          </Box>
          <Typography variant="h6" fontWeight={700} textAlign="center">
            Neram Staff Login
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Internal access for outreach tools. Not for college or student users.
          </Typography>
        </Stack>

        <form onSubmit={handleSubmit}>
          <Stack gap={2}>
            <TextField
              label="Your Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              required
              autoComplete="name"
              size="medium"
            />
            <TextField
              label="Your Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
              required
              autoComplete="email"
              size="medium"
            />
            <TextField
              label="Staff Secret"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              fullWidth
              required
              autoComplete="current-password"
              size="medium"
            />
            {error && <Alert severity="error">{error}</Alert>}
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ minHeight: 48 }}
            >
              {loading ? <CircularProgress size={22} color="inherit" /> : 'Sign in'}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Box>
  );
}
