'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Box, Typography, Skeleton, Alert } from '@neram/ui';
import { PhoneOutlined } from '@mui/icons-material';
import type { FeeStructure } from '@neram/database';
import FeeCard from '@/components/fees/FeeCard';
import PaymentToggle from '@/components/fees/PaymentToggle';
import FAQ from '@/components/fees/FAQ';
import IncludedSection from '@/components/fees/IncludedSection';
import { getFeePlanBadge } from '@/lib/fee-plan-badge';
import { PageHero, Section, CtaButton, tokens } from '@/design-system';

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
    <Box>
      <PageHero
        title={t('title')}
        lede={t('subtitle')}
        blueprint={false}
      />

      <Section id="plans" rule={false} width="narrow" gap={4}>
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {!loading && feeStructures.length > 0 && (
          <PaymentToggle value={paymentMode} onChange={setPaymentMode} t={t} />
        )}

        {/* Fee cards: one per row on phones so no plan is hidden off screen */}
        {loading ? (
          <Box
            data-testid="fee-skeletons"
            sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 3 }}
          >
            {[1, 2].map((i) => (
              <Skeleton key={i} variant="rectangular" height={320} sx={{ borderRadius: `${tokens.radius}px` }} />
            ))}
          </Box>
        ) : feeStructures.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
            <Typography component="h2" sx={{ fontSize: '1.25rem', fontWeight: 700 }}>
              {t('noFeeStructures')}
            </Typography>
            <Typography sx={{ color: tokens.inkMuted, mb: 1.5 }}>{t('contactForFees')}</Typography>
            <CtaButton href={PHONE_HREF} startIcon={<PhoneOutlined aria-hidden />} endIcon={null}>
              {t('callUs')}
            </CtaButton>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 3 }}>
              {feeStructures.map((fee) => {
                const badge = getBadge(fee);
                const isMultiYear = getFeePlanBadge(fee) === 'future_year';
                return (
                  <Box key={fee.id} data-testid="fee-card">
                    <FeeCard
                      fee={fee}
                      paymentMode={paymentMode}
                      locale={locale}
                      badgeLabel={badge?.label}
                      badgeColor={badge?.color}
                      isHighlighted={badge?.highlighted}
                      isMultiYear={isMultiYear}
                      extraOverOneYear={isMultiYear && oneYearPlan ? priceOf(fee) - priceOf(oneYearPlan) : 0}
                      t={t}
                    />
                  </Box>
                );
              })}
            </Box>
            <Typography sx={{ textAlign: 'center', fontSize: '0.9375rem', color: tokens.inkMuted }}>{t('comboNote')}</Typography>
          </Box>
        )}
      </Section>

      {/* What the fee buys, shown even before the prices load */}
      <Section id="included-band" tone="white" width="narrow">
        <IncludedSection t={t} />
      </Section>

      <Section id="fee-faq" width="narrow" gap={4}>
        <FAQ t={t} keys={FEE_FAQ_KEYS} />
        {/* One quiet contact line instead of a sales block */}
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <CtaButton variant="link" href={PHONE_HREF} startIcon={<PhoneOutlined aria-hidden />} endIcon={null}>
            {t('questionsCall')} {PHONE_LABEL}
          </CtaButton>
        </Box>
      </Section>
    </Box>
  );
}
