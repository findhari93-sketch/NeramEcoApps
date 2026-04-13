'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Paper, Typography, TextField, Button, Alert,
  CircularProgress, Stack, InputAdornment, IconButton,
} from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { getSupabaseBrowserClient } from '@neram/database';

export default function CollegeDashboardLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      router.push('/college-dashboard');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message === 'Invalid login credentials'
            ? 'Incorrect email or password. Contact Neram Classes if you forgot your credentials.'
            : err.message
          : 'Login failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

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
        sx={{ width: '100%', maxWidth: 400, p: { xs: 3, sm: 4 }, borderRadius: 3 }}
      >
        <Stack alignItems="center" gap={1} sx={{ mb: 3 }}>
          <Box
            sx={{
              width: 52, height: 52, bgcolor: '#16a34a',
              borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <SchoolIcon sx={{ color: 'white', fontSize: 28 }} />
          </Box>
          <Typography variant="h6" fontWeight={700} textAlign="center">
            College Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Sign in to manage your college profile, leads, and analytics.
          </Typography>
        </Stack>

        <form onSubmit={handleLogin}>
          <Stack gap={2}>
            {error && <Alert severity="error" sx={{ py: 0.5 }}>{error}</Alert>}
            <TextField
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
              size="small"
              autoComplete="email"
              autoFocus
            />
            <TextField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              size="small"
              autoComplete="current-password"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword((v) => !v)}
                      edge="end"
                      size="small"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={loading}
              sx={{ bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' }, py: 1.25, fontWeight: 700 }}
            >
              {loading ? <CircularProgress size={18} color="inherit" /> : 'Sign In'}
            </Button>
          </Stack>
        </form>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 2.5 }}>
          Credentials are provided by Neram Classes. Contact us if you need access.
        </Typography>
      </Paper>
    </Box>
  );
}
