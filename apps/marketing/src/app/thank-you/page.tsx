'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { Box, Typography } from '@neram/ui';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import { CtaButton, eyebrowSx, tokens as t } from '@/design-system';

const GA_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
const GA_ADS_CREDIT_SIGNUP_LABEL = process.env.NEXT_PUBLIC_GOOGLE_ADS_CREDIT_SIGNUP_LABEL;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';

const NEXT_STEPS: Array<{ step: string; text: string; done?: boolean }> = [
  { step: '1', text: 'Application received', done: true },
  { step: '2', text: 'Our team reviews your application (24-48 hours)' },
  { step: '3', text: 'You will be notified via email & WhatsApp' },
  { step: '4', text: 'Complete enrollment in your student dashboard' },
];

export default function ThankYouPage() {
  // Outside [locale]: a client provider lets the design-system Link resolve "/" (see DESIGN_SYSTEM.md Gotchas).
  return (
    <NextIntlClientProvider locale="en" messages={{}} timeZone="Asia/Kolkata">
      <Suspense fallback={null}>
        <ThankYouContent />
      </Suspense>
    </NextIntlClientProvider>
  );
}

function ThankYouContent() {
  const searchParams = useSearchParams();
  const applicationNumber = searchParams.get('app') || '';

  // This page confirms a submitted application, not a payment. It used to fire
  // the Purchase conversion on every load (refreshes included, no
  // transaction_id), which taught Smart Bidding that a form fill was a sale.
  // Paid admissions now reach Google Ads as the offline "Admission paid"
  // conversion, uploaded nightly by the admin app (lib/marketing-ai), with the
  // real fee as its value. transaction_id stops a refresh counting twice.
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).gtag && GA_ADS_ID && GA_ADS_CREDIT_SIGNUP_LABEL) {
      (window as any).gtag('event', 'conversion', {
        send_to: `${GA_ADS_ID}/${GA_ADS_CREDIT_SIGNUP_LABEL}`,
        value: 1.0,
        currency: 'INR',
        transaction_id: applicationNumber || undefined,
      });
    }
  }, [applicationNumber]);

  return (
    <Box
      component="main"
      sx={{ minHeight: '100dvh', bgcolor: t.ground, color: t.ink, fontFamily: t.fontSans, px: 2, py: { xs: 4, sm: 8 }, boxSizing: 'border-box' }}
    >
      <Box sx={{ maxWidth: 560, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Typography component="p" sx={{ ...eyebrowSx, textAlign: 'center' }}>
          Neram Classes
        </Typography>

        <Box
          sx={{
            bgcolor: t.surface,
            border: `1px solid ${t.line}`,
            borderRadius: `${t.radius}px`,
            px: { xs: 2.5, sm: 4 },
            py: { xs: 4, sm: 5 },
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 2,
          }}
        >
          <CheckCircleOutlinedIcon aria-hidden sx={{ fontSize: 64, color: t.success }} />
          <Typography component="h1" sx={{ m: 0, fontSize: 'clamp(1.75rem, 5vw, 2.25rem)', fontWeight: 800, lineHeight: 1.15 }}>
            Application Submitted!
          </Typography>

          {applicationNumber && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, width: '100%' }}>
              <Typography component="p" sx={{ m: 0, fontSize: '1rem', color: t.inkMuted }}>
                Your application number is:
              </Typography>
              <Typography
                component="p"
                sx={{
                  m: 0,
                  fontFamily: t.fontMono,
                  fontSize: { xs: '1.375rem', sm: '1.75rem' },
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  bgcolor: t.ground,
                  border: `1px solid ${t.line}`,
                  borderRadius: `${t.radius}px`,
                  py: 1.5,
                  px: 3,
                  maxWidth: '100%',
                  boxSizing: 'border-box',
                  wordBreak: 'break-all',
                }}
              >
                {applicationNumber}
              </Typography>
            </Box>
          )}

          {/* What happens next */}
          <Box sx={{ width: '100%', mt: 1, textAlign: 'left' }}>
            <Typography component="h2" sx={{ m: 0, mb: 1, fontSize: '1.0625rem', fontWeight: 700 }}>
              What happens next?
            </Typography>
            <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', borderTop: `1px solid ${t.ink}` }}>
              {NEXT_STEPS.map((item) => (
                <Box
                  component="li"
                  key={item.step}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, borderBottom: `1px solid ${t.line}` }}
                >
                  <Box
                    aria-hidden
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: t.fontMono,
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      bgcolor: item.done ? t.success : t.surface,
                      color: item.done ? t.surface : t.inkMuted,
                      border: item.done ? 'none' : `1px solid ${t.lineStrong}`,
                      '& svg': { fontSize: 18 },
                    }}
                  >
                    {item.done ? <CheckOutlinedIcon /> : item.step}
                  </Box>
                  <Typography component="span" sx={{ fontSize: '1rem', lineHeight: 1.45, color: item.done ? t.ink : t.inkMuted, fontWeight: item.done ? 600 : 400 }}>
                    {item.text}
                    {item.done && (
                      <Box
                        component="span"
                        sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}
                      >
                        {' '}(done)
                      </Box>
                    )}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>

          <Box sx={{ mt: 1.5, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
            <CtaButton href={`${APP_URL}/my-applications`} fullWidth>
              Track Your Application
            </CtaButton>
            <CtaButton variant="link" href="/">
              Back to Home
            </CtaButton>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
