'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Button,
  Grid,
  Skeleton,
  Alert,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import {
  PhoneOutlined,
  ArrowForwardOutlined,
} from '@mui/icons-material';
import Link from 'next/link';
import type { FeeStructure } from '@neram/database';
import FeeCard from '@/components/fees/FeeCard';
import PaymentToggle from '@/components/fees/PaymentToggle';
import WhyInvestSection from '@/components/fees/WhyInvestSection';
import ClassInfoSection from '@/components/fees/ClassInfoSection';
import FAQ from '@/components/fees/FAQ';

export default function FeesPageContent() {
  const t = useTranslations('fees');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const params = useParams();
  const locale = (params?.locale as string) || 'en';

  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<'single' | 'installment'>('single');

  useEffect(() => {
    fetchFeeStructures();
  }, []);

  const fetchFeeStructures = async () => {
    try {
      const response = await fetch('/api/fee-structures?excludeHidden=true');
      const data = await response.json();

      if (data.feeStructures) {
        setFeeStructures(data.feeStructures);
      } else {
        setError('Failed to load fee structures');
      }
    } catch {
      setError('Failed to load fee information. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Determine badge logic: show both recommended badges
  const getBadge = (fee: FeeStructure) => {
    // Use program_type or duration to distinguish 1-year vs 2-year
    const isOneYear =
      fee.program_type === 'crash_course' ||
      fee.duration?.toLowerCase().includes('1 year') ||
      fee.duration?.toLowerCase().includes('one year');
    const isTwoYear =
      fee.program_type === 'year_long' ||
      fee.duration?.toLowerCase().includes('2 year') ||
      fee.duration?.toLowerCase().includes('two year');

    if (isOneYear) {
      return {
        label: t('recommendedCurrentYear'),
        color: 'success' as const,
        highlighted: true,
      };
    }
    if (isTwoYear) {
      return {
        label: t('bestValueFuture'),
        color: 'info' as const,
        highlighted: false,
      };
    }
    return null;
  };

  return (
    <Box sx={{ py: { xs: 3, md: 4 }, pb: isMobile ? 10 : 4 }}>
      <Container maxWidth="lg">
        {/* Hero Section */}
        <Box textAlign="center" mb={{ xs: 4, md: 6 }}>
          <Typography
            variant="h3"
            component="h1"
            gutterBottom
            sx={{
              fontWeight: 800,
              fontSize: { xs: '1.75rem', sm: '2.5rem', md: '3rem' },
              lineHeight: 1.2,
            }}
          >
            {t('title')}
          </Typography>
          <Typography
            variant="h6"
            color="text.secondary"
            sx={{
              maxWidth: 650,
              mx: 'auto',
              mb: 3,
              fontSize: { xs: '0.95rem', sm: '1.1rem' },
              lineHeight: 1.5,
            }}
          >
            {t('subtitle')}
          </Typography>

          {/* Contact Banner */}
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              px: 3,
              py: 1.5,
              borderRadius: 2,
            }}
          >
            <PhoneOutlined />
            <Typography variant="body1" component="span" fontWeight={600}>
              {t('questionsCall')}{' '}
              <Box
                component="a"
                href="tel:+919176137043"
                sx={{ color: 'inherit', fontWeight: 700, textDecoration: 'none' }}
              >
                +91 91761 37043
              </Box>
            </Typography>
          </Box>
        </Box>

        {/* Error Alert */}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Payment Mode Toggle */}
        {!loading && feeStructures.length > 0 && (
          <PaymentToggle value={paymentMode} onChange={setPaymentMode} t={t} />
        )}

        {/* Fee Cards */}
        {loading ? (
          <Grid container spacing={3} justifyContent="center">
            {[1, 2].map((i) => (
              <Grid item xs={12} sm={6} md={5} key={i}>
                <Skeleton
                  variant="rectangular"
                  height={400}
                  sx={{ borderRadius: 3 }}
                />
              </Grid>
            ))}
          </Grid>
        ) : feeStructures.length === 0 ? (
          <Box textAlign="center" py={6}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {t('noFeeStructures')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {t('contactForFees')}
            </Typography>
            <Button
              variant="contained"
              component="a"
              href="tel:+919176137043"
              startIcon={<PhoneOutlined />}
              sx={{ minHeight: 48 }}
            >
              {t('callUs')}
            </Button>
          </Box>
        ) : (
          <Box sx={{ mb: 8 }}>
            {/* Horizontal scroll on mobile, centered grid on desktop */}
            <Box
              sx={{
                display: { xs: 'flex', md: 'none' },
                overflowX: 'auto',
                gap: 2,
                pb: 2,
                px: 0.5,
                '&::-webkit-scrollbar': { display: 'none' },
                msOverflowStyle: 'none',
                scrollbarWidth: 'none',
              }}
            >
              {feeStructures.map((fee) => {
                const badge = getBadge(fee);
                return (
                  <Box
                    key={fee.id}
                    sx={{
                      minWidth: 300,
                      maxWidth: 340,
                      flexShrink: 0,
                    }}
                  >
                    <FeeCard
                      fee={fee}
                      paymentMode={paymentMode}
                      locale={locale}
                      badgeLabel={badge?.label}
                      badgeColor={badge?.color}
                      isHighlighted={badge?.highlighted}
                      t={t}
                    />
                  </Box>
                );
              })}
            </Box>

            {/* Desktop grid */}
            <Grid
              container
              spacing={3}
              justifyContent="center"
              sx={{ display: { xs: 'none', md: 'flex' } }}
            >
              {feeStructures.map((fee) => {
                const badge = getBadge(fee);
                return (
                  <Grid item xs={12} sm={6} md={5} key={fee.id}>
                    <FeeCard
                      fee={fee}
                      paymentMode={paymentMode}
                      locale={locale}
                      badgeLabel={badge?.label}
                      badgeColor={badge?.color}
                      isHighlighted={badge?.highlighted}
                      t={t}
                    />
                  </Grid>
                );
              })}
            </Grid>

            {/* Combo Note */}
            <Typography
              variant="body2"
              color="text.secondary"
              textAlign="center"
              sx={{ mt: 3 }}
            >
              {t('comboNote')}
            </Typography>
          </Box>
        )}

        {/* Why Invest Section */}
        <WhyInvestSection t={t} />

        {/* Class Info Section */}
        <ClassInfoSection t={t} />

        {/* FAQ Section */}
        <FAQ t={t} />

        {/* Final CTA */}
        <Box
          textAlign="center"
          sx={{
            py: 6,
            px: 3,
            bgcolor: 'primary.50',
            borderRadius: 4,
            mb: 4,
          }}
        >
          <Typography
            variant="h4"
            fontWeight={700}
            gutterBottom
            sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}
          >
            {t('ctaTitle')}
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ maxWidth: 500, mx: 'auto', mb: 3 }}
          >
            {t('ctaSubtitle')}
          </Typography>
          <Button
            variant="contained"
            size="large"
            component={Link}
            href={`/${locale}/apply`}
            endIcon={<ArrowForwardOutlined />}
            sx={{
              minHeight: 52,
              px: 4,
              fontWeight: 700,
              fontSize: '1.05rem',
              borderRadius: 2,
            }}
          >
            {t('applyNow')}
          </Button>
        </Box>
      </Container>

      {/* Sticky Mobile Phone Bar */}
      {isMobile && (
        <Box
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 1100,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            py: 1.5,
            px: 2,
            boxShadow: '0 -2px 10px rgba(0,0,0,0.15)',
          }}
        >
          <PhoneOutlined />
          <Typography variant="body1" fontWeight={600}>
            <Box
              component="a"
              href="tel:+919176137043"
              sx={{ color: 'inherit', textDecoration: 'none' }}
            >
              {t('questionsCall')} +91 91761 37043
            </Box>
          </Typography>
        </Box>
      )}
    </Box>
  );
}
