'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Container, Box, Typography, Button, Stack, Card, CardContent, Grid, AppBar, Toolbar, CircularProgress } from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import { useSSOToken } from '@/hooks/useSSOToken';
import Link from 'next/link';

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'http://localhost:3010';

function HomePageInner() {
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
          // Use timestamp to prevent redirect loops (block for 10s after attempt)
          // but allow SSO retry on subsequent page refreshes
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

  if (sso.error) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          gap: 2,
          p: 3,
          textAlign: 'center',
        }}
      >
        <Typography variant="h6" color="error">
          Sign-in Failed
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Automatic sign-in from the main site didn&apos;t work. Please log in directly.
        </Typography>
        <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
          <Button
            variant="contained"
            component={Link}
            href="/login"
            sx={{ minHeight: 48 }}
          >
            Login
          </Button>
          <Button
            variant="outlined"
            onClick={sso.retrySSO}
            sx={{ minHeight: 48 }}
          >
            Retry
          </Button>
        </Stack>
      </Box>
    );
  }

  // Already authenticated — show spinner while redirecting to dashboard
  if (user) {
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
    <>
      <AppBar position="static" color="primary" elevation={1}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
            Neram Classes
          </Typography>
          {user ? (
            <Button color="inherit" component={Link} href="/dashboard">
              Dashboard
            </Button>
          ) : (
            <Button color="inherit" component={Link} href="/login">
              Login
            </Button>
          )}
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg">
        <Box sx={{ py: { xs: 4, md: 8 } }}>
          {/* Hero Section */}
          <Box sx={{ textAlign: 'center', mb: 6 }}>
            <Typography
              variant="h2"
              component="h1"
              gutterBottom
              sx={{ fontSize: { xs: '2rem', md: '3.5rem' }, fontWeight: 700 }}
            >
              Neram Classes Tools
            </Typography>
            <Typography
              variant="h5"
              color="text.secondary"
              sx={{ mb: 4, fontSize: { xs: '1rem', md: '1.5rem' } }}
            >
              Your complete NATA preparation toolkit
            </Typography>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              justifyContent="center"
            >
              <Button
                component={Link}
                href="/login"
                variant="contained"
                size="large"
                sx={{ px: 4, py: 1.5 }}
              >
                Get Started
              </Button>
              <Button
                variant="outlined"
                size="large"
                sx={{ px: 4, py: 1.5 }}
                href="#features"
              >
                Learn More
              </Button>
            </Stack>
          </Box>

          {/* Features Section */}
          <Box id="features" sx={{ mt: 8 }}>
            <Typography
              variant="h3"
              component="h2"
              textAlign="center"
              gutterBottom
              sx={{ mb: 4, fontSize: { xs: '1.75rem', md: '2.5rem' } }}
            >
              Tools & Features
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6} md={4}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom fontWeight={600}>
                      Cutoff Calculator
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Calculate your NATA cutoff scores and predict your chances based on previous year trends
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom fontWeight={600}>
                      College Predictor
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Find the best architecture colleges based on your NATA score and preferences
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom fontWeight={600}>
                      Exam Centers
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Locate NATA exam centers near you with detailed information and directions
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom fontWeight={600}>
                      Application Form
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Apply for NATA coaching with our streamlined application process
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom fontWeight={600}>
                      Progress Tracking
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Track your preparation progress and identify areas for improvement
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom fontWeight={600}>
                      Mobile First
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Access all tools seamlessly on your mobile device, anytime, anywhere
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Box>

          {/* CTA Section */}
          <Box sx={{ mt: 8, textAlign: 'center', py: 4 }}>
            <Typography variant="h4" gutterBottom sx={{ fontSize: { xs: '1.5rem', md: '2rem' } }}>
              Ready to excel in NATA?
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Join thousands of students using our tools for NATA preparation
            </Typography>
            <Button
              component={Link}
              href="/login"
              variant="contained"
              size="large"
              sx={{ px: 5, py: 1.5 }}
            >
              Sign In Now
            </Button>
          </Box>
        </Box>
      </Container>
    </>
  );
}

export default function HomePage() {
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
      <HomePageInner />
    </Suspense>
  );
}
