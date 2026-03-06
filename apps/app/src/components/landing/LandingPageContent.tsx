'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, Typography, Button, Stack, CircularProgress } from '@neram/ui';
import { neramTokens } from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import { useSSOToken } from '@/hooks/useSSOToken';
import Link from 'next/link';

import LandingNavbar from './LandingNavbar';
import HeroSection from './HeroSection';
import ToolsShowcase from './ToolsShowcase';
import HowItWorks from './HowItWorks';
import StatsBar from './StatsBar';
import JeeTeaser from './JeeTeaser';
import FAQSection from './FAQSection';
import FinalCTA from './FinalCTA';
import LandingFooter from './LandingFooter';

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'http://localhost:3010';

export default function LandingPageContent() {
  const { user, loading } = useFirebaseAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sso = useSSOToken();

  // Redirect to dashboard if already logged in
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
          const ssoAttemptedAt = sessionStorage.getItem('neram_sso_attempted');
          const isRecent = ssoAttemptedAt && (Date.now() - Number(ssoAttemptedAt)) < 10000;
          if (!isRecent) {
            sessionStorage.setItem('neram_sso_attempted', String(Date.now()));
            const currentUrl = window.location.origin + window.location.pathname;
            window.location.href = `${MARKETING_URL}/sso?redirect=${encodeURIComponent(currentUrl)}`;
            return;
          }
        } catch {
          // sessionStorage not available, skip SSO
        }
      }
    }
  }, [loading, user, sso.processing, sso.error, searchParams]);

  // Loading state
  if (loading || sso.processing) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          bgcolor: neramTokens.navy[900],
          gap: 2,
        }}
      >
        <CircularProgress sx={{ color: neramTokens.gold[500] }} />
        <Typography sx={{ color: neramTokens.cream[300] }}>Loading...</Typography>
      </Box>
    );
  }

  // SSO error
  if (sso.error) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          bgcolor: neramTokens.navy[900],
          gap: 2,
          p: 3,
          textAlign: 'center',
        }}
      >
        <Typography variant="h6" sx={{ color: neramTokens.error }}>
          Sign-in Failed
        </Typography>
        <Typography variant="body2" sx={{ color: neramTokens.cream[300] }}>
          Automatic sign-in from the main site didn&apos;t work. Please log in directly.
        </Typography>
        <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
          <Button
            component={Link}
            href="/login"
            variant="contained"
            sx={{
              bgcolor: neramTokens.gold[500],
              color: neramTokens.navy[950],
              minHeight: 48,
              '&:hover': { bgcolor: neramTokens.gold[400] },
            }}
          >
            Login
          </Button>
          <Button
            variant="outlined"
            onClick={sso.retrySSO}
            sx={{
              color: neramTokens.cream[100],
              borderColor: `${neramTokens.cream[100]}30`,
              minHeight: 48,
            }}
          >
            Retry
          </Button>
        </Stack>
      </Box>
    );
  }

  // Already authenticated — spinner while redirecting
  if (user) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          bgcolor: neramTokens.navy[900],
          gap: 2,
        }}
      >
        <CircularProgress sx={{ color: neramTokens.gold[500] }} />
        <Typography sx={{ color: neramTokens.cream[300] }}>Loading...</Typography>
      </Box>
    );
  }

  // Landing page
  return (
    <Box sx={{ bgcolor: neramTokens.navy[900], minHeight: '100vh' }}>
      <header>
        <LandingNavbar />
      </header>
      <main>
        <HeroSection />
        <ToolsShowcase />
        <HowItWorks />
        <StatsBar />
        <JeeTeaser />
        <FAQSection />
        <FinalCTA />
      </main>
      <LandingFooter />
    </Box>
  );
}
