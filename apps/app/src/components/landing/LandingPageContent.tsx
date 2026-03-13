'use client';

import { useEffect, useState } from 'react';
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
  const [redirecting, setRedirecting] = useState(false);

  // Redirect to dashboard if already logged in (background check)
  useEffect(() => {
    if (!loading && user) {
      setRedirecting(true);
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Try SSO with marketing app (once per session, background)
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

  // Always render the landing page content immediately.
  // Auth checks and redirects happen in background via useEffect above.
  return (
    <Box sx={{ bgcolor: neramTokens.navy[900], minHeight: '100vh', position: 'relative' }}>
      {/* SSO error banner — shown as overlay on top of content, not replacing it */}
      {sso.error && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1300,
            bgcolor: neramTokens.navy[950],
            borderBottom: `2px solid ${neramTokens.error}`,
            p: 2,
            textAlign: 'center',
          }}
        >
          <Typography variant="body2" sx={{ color: neramTokens.error, fontWeight: 600 }}>
            Automatic sign-in didn&apos;t work.
          </Typography>
          <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 1 }}>
            <Button
              component={Link}
              href="/login"
              variant="contained"
              size="small"
              sx={{
                bgcolor: neramTokens.gold[500],
                color: neramTokens.navy[950],
                minHeight: 36,
                '&:hover': { bgcolor: neramTokens.gold[400] },
              }}
            >
              Login
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={sso.retrySSO}
              sx={{
                color: neramTokens.cream[100],
                borderColor: `${neramTokens.cream[100]}30`,
                minHeight: 36,
              }}
            >
              Retry
            </Button>
          </Stack>
        </Box>
      )}

      {/* Subtle redirecting indicator — does NOT block content */}
      {redirecting && (
        <Box
          sx={{
            position: 'fixed',
            top: 16,
            right: 16,
            zIndex: 1300,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            bgcolor: `${neramTokens.navy[800]}ee`,
            borderRadius: 2,
            px: 2,
            py: 1,
          }}
        >
          <CircularProgress size={16} sx={{ color: neramTokens.gold[500] }} />
          <Typography variant="caption" sx={{ color: neramTokens.cream[300] }}>
            Redirecting to dashboard...
          </Typography>
        </Box>
      )}

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
