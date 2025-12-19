'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Button, Card, CardContent, Typography, Container } from '@neram/ui';
import { useMicrosoftAuth } from '@neram/auth';

export default function LoginPage() {
  const router = useRouter();
  const { signIn, user, loading } = useMicrosoftAuth();

  useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);

  const handleLogin = async () => {
    try {
      await signIn();
    } catch (error) {
      console.error('Login failed:', error);
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

            <Button
              variant="contained"
              fullWidth
              size="large"
              onClick={handleLogin}
              sx={{ py: 1.5 }}
            >
              Sign in with Microsoft
            </Button>

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
