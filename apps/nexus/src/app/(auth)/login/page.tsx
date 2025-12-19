'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Button, Typography, CircularProgress } from '@neram/ui';
import { useMicrosoftAuth } from '@neram/auth';

export default function LoginPage() {
  const router = useRouter();
  const { signIn, user, loading, error } = useMicrosoftAuth();

  useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);

  const handleLogin = async () => {
    try {
      await signIn();
    } catch (err) {
      console.error('Login failed:', err);
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

      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error.message || 'Authentication failed. Please try again.'}
        </Typography>
      )}

      <Button
        variant="contained"
        size="large"
        fullWidth
        onClick={handleLogin}
        sx={{
          py: 1.5,
          textTransform: 'none',
          fontSize: '1rem',
        }}
      >
        Sign in with Microsoft
      </Button>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 3, display: 'block' }}>
        By signing in, you agree to our Terms of Service and Privacy Policy
      </Typography>
    </Box>
  );
}
