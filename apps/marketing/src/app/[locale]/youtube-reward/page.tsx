'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  Box,
  Container,
  Typography,
  Paper,
  Button,
  Alert,
  Snackbar,
  Stepper,
  Step,
  StepLabel,
  CircularProgress,
} from '@neram/ui';

function YouTubeRewardContent() {
  const t = useTranslations('youtubeReward');
  const searchParams = useSearchParams();
  const params = useParams();
  const locale = params.locale as string;

  const couponCode = searchParams.get('coupon');
  const userName = searchParams.get('name');
  const error = searchParams.get('error');

  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (couponCode) {
      try {
        await navigator.clipboard.writeText(couponCode);
        setCopied(true);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  // If there's an error, show error state
  if (error) {
    return (
      <Box sx={{ py: { xs: 8, md: 12 }, minHeight: '60vh' }}>
        <Container maxWidth="sm">
          <Paper
            elevation={3}
            sx={{
              p: 4,
              textAlign: 'center',
              borderRadius: 3,
            }}
          >
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                bgcolor: 'error.light',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 3,
              }}
            >
              <Typography variant="h3">!</Typography>
            </Box>

            <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
              Oops! Something went wrong
            </Typography>

            <Alert severity="error" sx={{ mb: 3, textAlign: 'left' }}>
              {decodeURIComponent(error)}
            </Alert>

            <Button
              component={Link}
              href={`/${locale}`}
              variant="contained"
              size="large"
            >
              Return to Home
            </Button>
          </Paper>
        </Container>
      </Box>
    );
  }

  // If no coupon code, redirect to home
  if (!couponCode) {
    return (
      <Box sx={{ py: { xs: 8, md: 12 }, minHeight: '60vh' }}>
        <Container maxWidth="sm">
          <Paper
            elevation={3}
            sx={{
              p: 4,
              textAlign: 'center',
              borderRadius: 3,
            }}
          >
            <Typography variant="h5" gutterBottom>
              No coupon code found
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              Please subscribe to our YouTube channel to receive your discount coupon.
            </Typography>
            <Button
              component={Link}
              href={`/${locale}`}
              variant="contained"
              size="large"
            >
              Return to Home
            </Button>
          </Paper>
        </Container>
      </Box>
    );
  }

  // Success state
  return (
    <Box sx={{ py: { xs: 8, md: 12 }, minHeight: '60vh', bgcolor: 'grey.50' }}>
      <Container maxWidth="md">
        {/* Success Card */}
        <Paper
          elevation={3}
          sx={{
            p: { xs: 3, md: 5 },
            textAlign: 'center',
            borderRadius: 3,
            mb: 4,
          }}
        >
          {/* Success Icon */}
          <Box
            sx={{
              width: 100,
              height: 100,
              borderRadius: '50%',
              bgcolor: 'success.light',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 3,
            }}
          >
            <Box
              component="svg"
              viewBox="0 0 24 24"
              sx={{ width: 50, height: 50, fill: 'success.main' }}
            >
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </Box>
          </Box>

          <Typography variant="h3" gutterBottom sx={{ fontWeight: 700, color: 'success.main' }}>
            {t('title')}
          </Typography>

          {userName && (
            <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
              Welcome, {userName}!
            </Typography>
          )}

          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            {t('subtitle')}
          </Typography>

          {/* Coupon Code Display */}
          <Box
            sx={{
              bgcolor: 'grey.100',
              borderRadius: 2,
              p: 3,
              mb: 3,
              border: '2px dashed',
              borderColor: 'primary.main',
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mb: 1 }}
            >
              {t('couponLabel')}
            </Typography>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 700,
                fontFamily: 'monospace',
                letterSpacing: 2,
                color: 'primary.main',
              }}
            >
              {couponCode}
            </Typography>
          </Box>

          <Button
            variant="outlined"
            size="large"
            onClick={handleCopy}
            sx={{ mb: 3 }}
          >
            {copied ? t('copySuccess') : 'Copy Code'}
          </Button>

          <Typography variant="body2" color="text.secondary">
            {t('instructions')}
          </Typography>
        </Paper>

        {/* How to Use Section */}
        <Paper
          elevation={1}
          sx={{
            p: { xs: 3, md: 4 },
            borderRadius: 3,
            mb: 4,
          }}
        >
          <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
            {t('howToUse')}
          </Typography>

          <Stepper orientation="vertical" activeStep={-1}>
            <Step completed={false}>
              <StepLabel>
                <Typography variant="body1">{t('step1')}</Typography>
              </StepLabel>
            </Step>
            <Step completed={false}>
              <StepLabel>
                <Typography variant="body1">{t('step2')}</Typography>
              </StepLabel>
            </Step>
            <Step completed={false}>
              <StepLabel>
                <Typography variant="body1">{t('step3')}</Typography>
              </StepLabel>
            </Step>
            <Step completed={false}>
              <StepLabel>
                <Typography variant="body1">{t('step4')}</Typography>
              </StepLabel>
            </Step>
          </Stepper>

          <Alert severity="info" sx={{ mt: 3 }}>
            {t('validityNote')}
          </Alert>
        </Paper>

        {/* CTA Buttons */}
        <Box sx={{ textAlign: 'center' }}>
          <Button
            component={Link}
            href={`/${locale}/courses`}
            variant="contained"
            size="large"
            sx={{ px: 4, py: 1.5 }}
          >
            {t('browseCourses')}
          </Button>
        </Box>
      </Container>

      {/* Copy Success Snackbar */}
      <Snackbar
        open={copied}
        autoHideDuration={3000}
        onClose={() => setCopied(false)}
        message={t('copySuccess')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}

// Wrapper component with Suspense boundary for useSearchParams
export default function YouTubeRewardPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ py: { xs: 8, md: 12 }, minHeight: '60vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <CircularProgress />
        </Box>
      }
    >
      <YouTubeRewardContent />
    </Suspense>
  );
}
