'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Box, Typography, Paper, Divider, Alert, Chip } from '@neram/ui';
import { setAuthRedirectUrl } from '@neram/auth';
import AuthButtons from '@/components/AuthButtons';
import Link from 'next/link';

// Storage key for YouTube subscribe intent
const YOUTUBE_SUBSCRIBE_KEY = 'neram_youtube_subscribe_intent';

export default function LoginPage() {
  const searchParams = useSearchParams();

  // Check if this is a YouTube subscribe flow
  const source = searchParams.get('source');
  const isYouTubeSubscribe = source === 'youtube_subscribe';

  // Capture redirect URL from query parameter (for cross-domain auth from marketing site)
  useEffect(() => {
    const redirectUrl = searchParams.get('redirect');

    // If this is a YouTube subscribe flow, store the intent
    if (isYouTubeSubscribe && redirectUrl) {
      sessionStorage.setItem(YOUTUBE_SUBSCRIBE_KEY, JSON.stringify({
        redirectUrl,
        timestamp: Date.now(),
      }));
    }

    if (redirectUrl) {
      // Validate it's a safe URL (same domain or known domains)
      try {
        const url = new URL(redirectUrl);
        const allowedHosts = ['neramclasses.com', 'www.neramclasses.com', 'app.neramclasses.com', 'localhost'];
        if (allowedHosts.some(host => url.hostname === host || url.hostname.endsWith('.' + host))) {
          setAuthRedirectUrl(redirectUrl);
        }
      } catch {
        // If not a valid URL, check if it's a relative path
        if (redirectUrl.startsWith('/')) {
          setAuthRedirectUrl(redirectUrl);
        }
      }
    }
  }, [searchParams, isYouTubeSubscribe]);

  return (
    <Paper
      elevation={3}
      sx={{
        p: { xs: 3, md: 4 },
        borderRadius: 2,
      }}
    >
      {/* YouTube Subscribe Banner */}
      {isYouTubeSubscribe && (
        <Alert
          severity="info"
          icon={
            <Box
              component="svg"
              viewBox="0 0 24 24"
              sx={{ width: 24, height: 24, fill: '#FF0000' }}
            >
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </Box>
          }
          sx={{ mb: 3 }}
        >
          <Typography variant="body2">
            <strong>Almost there!</strong> Sign in with Google to subscribe to our YouTube channel and claim your <Chip label="Rs. 50 OFF" size="small" color="error" sx={{ mx: 0.5 }} /> coupon.
          </Typography>
        </Alert>
      )}

      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Typography
          variant="h4"
          component="h1"
          gutterBottom
          sx={{ fontSize: { xs: '1.75rem', md: '2.125rem' }, fontWeight: 600 }}
        >
          {isYouTubeSubscribe ? 'Sign In to Continue' : 'Welcome Back'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {isYouTubeSubscribe
            ? 'Sign in with Google to complete your YouTube subscription and get your discount'
            : 'Sign in to access your NATA preparation tools'}
        </Typography>
      </Box>

      <AuthButtons isYouTubeSubscribe={isYouTubeSubscribe} />

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
