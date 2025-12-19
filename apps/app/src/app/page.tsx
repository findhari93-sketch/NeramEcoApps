'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Container, Box, Typography, Button, Stack, Card, CardContent, Grid } from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import Link from 'next/link';

export default function HomePage() {
  const { user, loading } = useFirebaseAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  return (
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
  );
}
