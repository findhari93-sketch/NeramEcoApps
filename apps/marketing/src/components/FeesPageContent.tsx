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
} from '@neram/ui';
import { PhoneOutlined } from '@mui/icons-material';
import type { FeeStructure } from '@neram/database';
import FeeCard from '@/components/fees/FeeCard';
import PaymentToggle from '@/components/fees/PaymentToggle';
import FAQ from '@/components/fees/FAQ';
import IncludedSection from '@/components/fees/IncludedSection';
import { getFeePlanBadge } from '@/lib/fee-plan-badge';

const PHONE_HREF = 'tel:+919176137043';
const PHONE_LABEL = '+91 91761 37043';

// Only the questions a student asks before paying: extra charges, instalments,
// refunds and missed classes. The selling points live on the course pages.
const FEE_FAQ_KEYS = ['faq2', 'faq4', 'faq1', 'faq5'] as const;

export default function FeesPageContent() {
  const t = useTranslations('fees');
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

  const getBadge = (fee: FeeStructure) => {
    switch (getFeePlanBadge(fee)) {
      case 'current_year':
        return { label: t('recommendedCurrentYear'), color: 'success' as const, highlighted: true };
      case 'future_year':
        return { label: t('bestValueFuture'), color: 'info' as const, highlighted: false };
      default:
        return null;
    }
  };

  // What the student pays in the selected mode, so "only ₹X more" matches the
  // prices on screen whether they pay once or in instalments.
  const priceOf = (fee: FeeStructure) =>
    paymentMode === 'single' ? fee.fee_amount - (fee.single_payment_discount || 0) : fee.fee_amount;
  const oneYearPlan = feeStructures.find((fee) => getFeePlanBadge(fee) === 'current_year');

  return (
    <Box sx={{ py: { xs: 3, md: 5 } }}>
      <Container maxWidth="md">
        {/* Heading */}
        <Box textAlign="center" mb={{ xs: 3, md: 4 }}>
          <Typography
            variant="h3"
            component="h1"
            sx={{
              fontWeight: 800,
              fontSize: { xs: '1.75rem', sm: '2.25rem', md: '2.5rem' },
              lineHeight: 1.2,
              mb: 1,
            }}
          >
            {t('title')}
          </Typography>
          <Typography
            color="text.secondary"
            sx={{ maxWidth: 520, mx: 'auto', fontSize: { xs: '1rem', sm: '1.1rem' }, lineHeight: 1.5 }}
          >
            {t('subtitle')}
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {!loading && feeStructures.length > 0 && (
          <PaymentToggle value={paymentMode} onChange={setPaymentMode} t={t} />
        )}

        {/* Fee cards: one per row on phones so no plan is hidden off screen */}
        {loading ? (
          <Grid container spacing={3} justifyContent="center" data-testid="fee-skeletons">
            {[1, 2].map((i) => (
              <Grid item xs={12} md={6} key={i}>
                <Skeleton variant="rectangular" height={320} sx={{ borderRadius: 1 }} />
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
              href={PHONE_HREF}
              startIcon={<PhoneOutlined />}
              sx={{ minHeight: 48 }}
            >
              {t('callUs')}
            </Button>
          </Box>
        ) : (
          <Box sx={{ mb: { xs: 5, md: 7 } }}>
            <Grid container spacing={3} justifyContent="center">
              {feeStructures.map((fee) => {
                const badge = getBadge(fee);
                const isMultiYear = getFeePlanBadge(fee) === 'future_year';
                return (
                  <Grid item xs={12} md={6} key={fee.id} data-testid="fee-card">
                    <FeeCard
                      fee={fee}
                      paymentMode={paymentMode}
                      locale={locale}
                      badgeLabel={badge?.label}
                      badgeColor={badge?.color}
                      isHighlighted={badge?.highlighted}
                      isMultiYear={isMultiYear}
                      extraOverOneYear={
                        isMultiYear && oneYearPlan ? priceOf(fee) - priceOf(oneYearPlan) : 0
                      }
                      t={t}
                    />
                  </Grid>
                );
              })}
            </Grid>

            <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mt: 3 }}>
              {t('comboNote')}
            </Typography>
          </Box>
        )}

        {/* What the fee buys, shown even before the prices load */}
        <IncludedSection t={t} />

        <FAQ t={t} keys={FEE_FAQ_KEYS} />

        {/* One quiet contact line instead of a sales block */}
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <Button
            component="a"
            href={PHONE_HREF}
            startIcon={<PhoneOutlined />}
            sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
          >
            {t('questionsCall')} {PHONE_LABEL}
          </Button>
        </Box>
      </Container>
    </Box>
  );
}
