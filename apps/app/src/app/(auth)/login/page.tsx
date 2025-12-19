'use client';

import { Box, Typography, Paper, Divider } from '@neram/ui';
import AuthButtons from '@/components/AuthButtons';
import Link from 'next/link';

export default function LoginPage() {
  return (
    <Paper
      elevation={3}
      sx={{
        p: { xs: 3, md: 4 },
        borderRadius: 2,
      }}
    >
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Typography
          variant="h4"
          component="h1"
          gutterBottom
          sx={{ fontSize: { xs: '1.75rem', md: '2.125rem' }, fontWeight: 600 }}
        >
          Welcome Back
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Sign in to access your NATA preparation tools
        </Typography>
      </Box>

      <AuthButtons />

      <Divider sx={{ my: 3 }} />

      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          By signing in, you agree to our{' '}
          <Link href="/terms" style={{ color: '#1976d2', textDecoration: 'underline' }}>
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" style={{ color: '#1976d2', textDecoration: 'underline' }}>
            Privacy Policy
          </Link>
        </Typography>
      </Box>

      <Box sx={{ mt: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Don't have an account? Sign up with Google or Email above
        </Typography>
      </Box>

      <Box sx={{ mt: 3, textAlign: 'center' }}>
        <Link href="/" style={{ color: '#1976d2', fontSize: '0.875rem' }}>
          Back to Home
        </Link>
      </Box>
    </Paper>
  );
}
