'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, Container, CircularProgress, Typography, Button, Stack, Alert } from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import { useSSOToken } from '@/hooks/useSSOToken';

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'http://localhost:3010';

function AuthLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useFirebaseAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sso = useSSOToken();

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Try SSO with marketing app (once per session)
  useEffect(() => {
    if (!loading && !user && !sso.processing && !sso.error) {
      const authToken = searchParams.get('authToken');
      const ssoParam = searchParams.get('sso');
      const signedOut = searchParams.get('signedOut');

      // If user just signed out, skip auto-SSO and clean up the URL param
      if (signedOut) {
        const url = new URL(window.location.href);
        url.searchParams.delete('signedOut');
        window.history.replaceState({}, '', url.toString());
        return;
      }

      if (!authToken && !ssoParam) {
        try {
          // Use timestamp to prevent redirect loops (block for 10s after attempt)
          // but allow SSO retry on subsequent page refreshes
          const ssoAttemptedAt = sessionStorage.getItem('neram_sso_attempted');
          const isRecent = ssoAttemptedAt && (Date.now() - Number(ssoAttemptedAt)) < 10000;
          if (!isRecent) {
            sessionStorage.setItem('neram_sso_attempted', String(Date.now()));
            const currentUrl = window.location.href;
            window.location.href = `${MARKETING_URL}/sso?redirect=${encodeURIComponent(currentUrl)}`;
            return;
          }
        } catch {
          // sessionStorage not available, skip SSO
        }
      }
    }
  }, [loading, user, sso.processing, sso.error, searchParams]);

  if (loading || sso.processing) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          gap: 2,
        }}
      >
        <CircularProgress />
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
      }}
    >
      <Container
        maxWidth="sm"
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          py: { xs: 4, md: 8 },
        }}
      >
        {sso.error && (
          <Alert
            severity="warning"
            sx={{ mb: 2 }}
            action={
              <Button size="small" onClick={sso.retrySSO}>
                Retry
              </Button>
            }
          >
            Automatic sign-in failed. Please log in directly.
          </Alert>
        )}
        {children}
      </Container>
    </Box>
  );
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            gap: 2,
          }}
        >
          <CircularProgress />
          <Typography>Loading...</Typography>
        </Box>
      }
    >
      <AuthLayoutInner>{children}</AuthLayoutInner>
    </Suspense>
  );
}
