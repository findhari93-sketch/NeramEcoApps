'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Button, Typography, CircularProgress, Alert } from '@neram/ui';
import { useMicrosoftAuth, getMsalErrorMessage } from '@neram/auth';

export default function LoginPage() {
  const router = useRouter();
  const { signIn, user, loading } = useMicrosoftAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [loginError, setLoginError] = useState<{ message: string; canRetry: boolean } | null>(null);

  useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);

  const handleLogin = async () => {
    setSigningIn(true);
    setLoginError(null);
    try {
      await signIn();
    } catch (err) {
      console.error('Login failed:', err);
      const errorInfo = getMsalErrorMessage(err as Error);
      setLoginError(errorInfo);
    } finally {
      setSigningIn(false);
    }
  };

  const handleClearSession = () => {
    if (typeof window !== 'undefined') {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith('msal.') || key.includes('msal')) {
          localStorage.removeItem(key);
        }
      }
      window.location.reload();
    }
  };

  if (loading) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Authenticating...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ textAlign: 'center' }}>
      <Typography
        variant="h4"
        component="h1"
        gutterBottom
        sx={{ fontWeight: 700, mb: 2 }}
      >
        Welcome to Nexus
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Sign in with your Microsoft account to access your classroom
      </Typography>

      {loginError && (
        <Alert severity={loginError.canRetry ? 'warning' : 'info'} sx={{ mb: 2 }}>
          {loginError.message}
        </Alert>
      )}

      <Button
        variant="contained"
        size="large"
        fullWidth
        onClick={handleLogin}
        disabled={signingIn}
        sx={{
          py: 1.5,
          textTransform: 'none',
          fontSize: '1rem',
        }}
      >
        {signingIn ? 'Signing in...' : 'Sign in with Microsoft'}
      </Button>

      {loginError?.canRetry && (
        <Button
          variant="text"
          size="small"
          fullWidth
          onClick={handleClearSession}
          sx={{ mt: 1, textTransform: 'none', color: 'text.secondary' }}
        >
          Having trouble? Clear session and retry
        </Button>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ mt: 3, display: 'block' }}>
        By signing in, you agree to our Terms of Service and Privacy Policy
      </Typography>
    </Box>
  );
}
