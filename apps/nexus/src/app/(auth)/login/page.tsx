'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, Button, Typography, CircularProgress, Alert } from '@neram/ui';
import { useMicrosoftAuth, getMsalErrorMessage } from '@neram/auth';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn, user, loading } = useMicrosoftAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [loginError, setLoginError] = useState<{ message: string; canRetry: boolean } | null>(null);
  const [showOnboardingHint, setShowOnboardingHint] = useState(false);

  // Detect app-onboarding flow from query param or sessionStorage
  useEffect(() => {
    const fromParam = searchParams.get('from');
    if (fromParam === 'app-onboarding') {
      sessionStorage.setItem('nexus_from', 'app-onboarding');
      setShowOnboardingHint(true);
    } else if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('nexus_from');
      if (stored === 'app-onboarding') {
        setShowOnboardingHint(true);
      }
    }
  }, [searchParams]);

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
      // Redirect flow navigates away; signIn() only returns if popup mode is used
    } catch (err) {
      // MsalLoginError with 'redirect_fallback' is expected for redirect flow — not a real error
      if (err instanceof Error && err.message?.includes('Redirecting')) return;
      console.error('Login failed:', err);
      const errorInfo = getMsalErrorMessage(err as Error);
      setLoginError(errorInfo);
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
      {showOnboardingHint && (
        <Alert severity="info" sx={{ mb: 3, textAlign: 'left' }}>
          Use the Microsoft Teams credentials from your student app to sign in here.
        </Alert>
      )}

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

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
