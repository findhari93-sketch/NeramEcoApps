'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Box, Typography, Button, Container } from '@neram/ui';
import { CheckCircleOutlined } from '@mui/icons-material';

const GA_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
const GA_ADS_PURCHASE_LABEL = process.env.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL;
const GA_ADS_CREDIT_SIGNUP_LABEL = process.env.NEXT_PUBLIC_GOOGLE_ADS_CREDIT_SIGNUP_LABEL;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';

export default function ThankYouPage() {
  return (
    <Suspense fallback={null}>
      <ThankYouContent />
    </Suspense>
  );
}

function ThankYouContent() {
  const searchParams = useSearchParams();
  const applicationNumber = searchParams.get('app') || '';

  // Fire Google Ads conversions on page load
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).gtag && GA_ADS_ID) {
      if (GA_ADS_PURCHASE_LABEL) {
        (window as any).gtag('event', 'conversion', {
          send_to: `${GA_ADS_ID}/${GA_ADS_PURCHASE_LABEL}`,
        });
      }
      if (GA_ADS_CREDIT_SIGNUP_LABEL) {
        (window as any).gtag('event', 'conversion', {
          send_to: `${GA_ADS_ID}/${GA_ADS_CREDIT_SIGNUP_LABEL}`,
          value: 1.0,
          currency: 'INR',
        });
      }
    }
  }, []);

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 6, md: 10 } }}>
      <Box textAlign="center">
        <CheckCircleOutlined sx={{ fontSize: 80, color: 'success.main', mb: 3 }} />
        <Typography variant="h4" gutterBottom fontWeight={700}>
          Application Submitted!
        </Typography>

        {applicationNumber && (
          <>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              Your application number is:
            </Typography>
            <Typography
              variant="h4"
              sx={{
                fontFamily: 'monospace',
                bgcolor: 'grey.100',
                py: 2,
                px: 4,
                borderRadius: 1,
                display: 'inline-block',
                my: 2,
                wordBreak: 'break-all',
              }}
            >
              {applicationNumber}
            </Typography>
          </>
        )}

        {/* What happens next timeline */}
        <Box sx={{ maxWidth: 480, mx: 'auto', mt: 4, textAlign: 'left' }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            What happens next?
          </Typography>
          {[
            { step: '1', text: 'Application received', done: true },
            { step: '2', text: 'Our team reviews your application (24-48 hours)' },
            { step: '3', text: 'You will be notified via email & WhatsApp' },
            { step: '4', text: 'Complete enrollment in your student dashboard' },
          ].map((item) => (
            <Box key={item.step} display="flex" alignItems="center" gap={2} mb={1.5}>
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  bgcolor: item.done ? 'success.main' : 'grey.300',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {item.done ? '\u2713' : item.step}
              </Box>
              <Typography variant="body2" color={item.done ? 'success.main' : 'text.secondary'}>
                {item.text}
              </Typography>
            </Box>
          ))}
        </Box>

        <Box mt={4} display="flex" gap={2} justifyContent="center" flexWrap="wrap">
          <Button
            variant="contained"
            href={`${APP_URL}/my-applications`}
            size="large"
            sx={{ minHeight: 48 }}
          >
            Track Your Application
          </Button>
          <Button variant="outlined" href="/" size="large" sx={{ minHeight: 48 }}>
            Back to Home
          </Button>
        </Box>
      </Box>
    </Container>
  );
}
