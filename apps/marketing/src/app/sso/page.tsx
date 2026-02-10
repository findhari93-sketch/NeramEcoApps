'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';
import { Box, Typography, CircularProgress } from '@neram/ui';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';

function SSOInner() {
  const { user, loading } = useFirebaseAuth();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function handleSSO() {
      const redirectUrl = searchParams.get('redirect') || APP_URL;

      if (loading) return;

      if (!user) {
        // Not logged in on marketing — redirect back
        const url = new URL(redirectUrl);
        url.searchParams.set('sso', 'none');
        window.location.href = url.toString();
        return;
      }

      try {
        const auth = getFirebaseAuth();
        const currentUser = auth.currentUser;
        if (currentUser) {
          const idToken = await currentUser.getIdToken();
          const response = await fetch(`${APP_URL}/api/auth/exchange-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
          });
          if (response.ok) {
            const { customToken } = await response.json();
            const url = new URL(redirectUrl);
            url.searchParams.set('authToken', customToken);
            window.location.href = url.toString();
            return;
          }
        }
      } catch (error) {
        console.error('SSO token exchange error:', error);
      }

      // Fallback: redirect without token
      const url = new URL(redirectUrl);
      url.searchParams.set('sso', 'error');
      window.location.href = url.toString();
    }

    handleSSO();
  }, [user, loading, searchParams]);

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
      <Typography>Authenticating...</Typography>
    </Box>
  );
}

export default function SSOPage() {
  return (
    <Suspense
      fallback={
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
          }}
        >
          <CircularProgress />
        </Box>
      }
    >
      <SSOInner />
    </Suspense>
  );
}
