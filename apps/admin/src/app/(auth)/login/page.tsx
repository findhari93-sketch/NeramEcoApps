'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Button, Card, CardContent, Typography, Container, Alert } from '@neram/ui';
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
    } catch (error) {
      console.error('Login failed:', error);
      const errorInfo = getMsalErrorMessage(error as Error);
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
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Card sx={{ width: '100%', maxWidth: 450 }}>
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 4 }}>
              <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
                Neram Classes
              </Typography>
              <Typography variant="h6" color="text.secondary" gutterBottom>
                Admin Panel
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Sign in with your Microsoft account to access the admin dashboard
              </Typography>
            </Box>

            {loginError && (
              <Alert severity={loginError.canRetry ? 'warning' : 'info'} sx={{ mb: 2 }}>
                {loginError.message}
              </Alert>
            )}

            <Button
              variant="contained"
              fullWidth
              size="large"
              onClick={handleLogin}
              disabled={signingIn}
              sx={{ py: 1.5 }}
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

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 3, textAlign: 'center' }}
            >
              Only authorized administrators can access this panel
            </Typography>
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
}
