'use client';

import { Box, Typography } from '@neram/ui';
import {
  ArrowDownwardRounded,
  LayersOutlined,
  NorthEast,
  StarOutlined,
  TrendingUpOutlined,
} from '@mui/icons-material';
import type { FeeStructure } from '@neram/database';
import { useApplicationStatus } from '@/hooks/useApplicationStatus';
import { useGoToApp } from '@/hooks/useGoToApp';
import { CheckList, CtaButton, tokens as t } from '@/design-system';
import { INCLUDED_SECTION_ID } from './IncludedSection';

// The four things a student weighs first. The full list sits under the cards.
const HIGHLIGHT_KEYS = ['h1', 'h2', 'h3', 'h4'] as const;

interface FeeCardProps {
  fee: FeeStructure;
  paymentMode: 'single' | 'installment';
  locale: string;
  badgeLabel?: string;
  badgeColor?: 'success' | 'info' | 'warning';
  isHighlighted?: boolean;
  /** A plan longer than a year repeats the one-year plan, so it says so. */
  isMultiYear?: boolean;
  /** How much more this plan costs than the one-year plan, in rupees. */
  extraOverOneYear?: number;
  t: (key: string, values?: Record<string, string | number>) => string;
}

const rupees = (n: number | null | undefined) => `₹${(n ?? 0).toLocaleString('en-IN')}`;

/** A /fees plan card. Highlighted = 3px gold top and the gold Apply button. */
export default function FeeCard({
  fee,
  paymentMode,
  badgeLabel,
  badgeColor = 'success',
  isHighlighted = false,
  isMultiYear = false,
  extraOverOneYear = 0,
  t: tr,
}: FeeCardProps) {
  const { status } = useApplicationStatus();
  const { goToApp } = useGoToApp();
  const isEnrolled = status === 'enrolled' || status === 'partial_payment';
  const discountedPrice = fee.fee_amount - (fee.single_payment_discount || 0);
  const hasDiscount = (fee.single_payment_discount || 0) > 0;
  const hasInstallments = fee.installment_1_amount && fee.installment_2_amount;

  return (
    <Box
      component="article"
      sx={{
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 2.25,
        p: { xs: 2.5, sm: 3 },
        bgcolor: t.surface,
        color: t.ink,
        border: `1px solid ${isHighlighted ? t.ink : t.line}`,
        borderTop: isHighlighted ? `3px solid ${t.gold500}` : `1px solid ${t.line}`,
        borderRadius: `${t.radius}px`,
      }}
    >
      {badgeLabel && (
        <Box
          component="span"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            width: 'fit-content',
            px: 1.25,
            py: 0.5,
            borderRadius: `${t.radiusPill}px`,
            fontSize: '0.75rem',
            fontWeight: 700,
            ...(badgeColor === 'success'
              ? { bgcolor: t.navy900, color: t.gold500 }
              : { border: `1px solid ${t.lineStrong}`, color: t.ink }),
            '& svg': { fontSize: 16 },
          }}
        >
          {badgeColor === 'success' ? <StarOutlined aria-hidden /> : <TrendingUpOutlined aria-hidden />}
          {badgeLabel}
        </Box>
      )}

      <Box>
        <Typography component="h2" sx={{ m: 0, fontWeight: 700, fontSize: { xs: '1.125rem', sm: '1.25rem' }, lineHeight: 1.3 }}>
          {fee.display_name}
        </Typography>
        <Typography sx={{ fontSize: '0.9375rem', color: t.inkMuted, mt: 0.5 }}>{fee.duration}</Typography>
      </Box>

      {paymentMode === 'single' ? (
        <Box>
          {hasDiscount && (
            <Typography sx={{ textDecoration: 'line-through', color: t.inkMuted, fontSize: '0.9375rem' }}>
              {tr('fullPrice')}: {rupees(fee.fee_amount)}
            </Typography>
          )}
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
            <Typography component="span" sx={{ fontWeight: 800, fontSize: { xs: '2rem', sm: '2.25rem' }, lineHeight: 1.1 }}>
              {rupees(hasDiscount ? discountedPrice : fee.fee_amount)}
            </Typography>
            {hasDiscount && (
              <Box
                component="span"
                sx={{
                  border: `1px solid ${t.success}`,
                  color: t.success,
                  borderRadius: `${t.radiusPill}px`,
                  px: 1,
                  py: 0.25,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                {tr('save')} {rupees(fee.single_payment_discount)}
              </Box>
            )}
          </Box>
          {fee.combo_extra_fee > 0 && (
            <Typography sx={{ mt: 0.5, fontSize: '0.8125rem', color: t.inkMuted }}>
              +{rupees(fee.combo_extra_fee)} {tr('forCombo')}
            </Typography>
          )}
        </Box>
      ) : hasInstallments ? (
        <Box>
          <Typography sx={{ fontSize: '0.9375rem', color: t.inkMuted, mb: 1 }}>{tr('payInInstallments')}:</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            {[
              { label: tr('installment1'), amount: fee.installment_1_amount },
              { label: tr('installment2'), amount: fee.installment_2_amount },
            ].map((part) => (
              <Box key={part.label} sx={{ p: 1.5, border: `1px solid ${t.line}`, borderRadius: `${t.radius}px`, bgcolor: t.ground }}>
                <Typography sx={{ fontSize: '0.8125rem', color: t.inkMuted }}>{part.label}</Typography>
                <Typography sx={{ fontWeight: 800, fontSize: '1.25rem' }}>{rupees(part.amount)}</Typography>
              </Box>
            ))}
          </Box>
          <Typography sx={{ mt: 1, fontSize: '0.9375rem', fontWeight: 600, color: t.inkMuted }}>
            {tr('total')}: {rupees(fee.fee_amount)}
          </Typography>
        </Box>
      ) : (
        <Box>
          <Typography sx={{ fontSize: '0.9375rem', color: t.inkMuted, mb: 1 }}>{tr('installmentDetailsComingSoon')}</Typography>
          <Typography component="span" sx={{ fontWeight: 800, fontSize: { xs: '2rem', sm: '2.25rem' } }}>
            {rupees(fee.fee_amount)}
          </Typography>
        </Box>
      )}

      <Box sx={{ borderTop: `1px solid ${t.line}`, pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {fee.schedule_summary && <Typography sx={{ fontSize: '0.9375rem', color: t.inkMuted }}>{fee.schedule_summary}</Typography>}

        {/* A longer plan is the one-year plan stretched over more years */}
        {isMultiYear && (
          <Box sx={{ display: 'flex', gap: 1.25, p: 1.5, borderRadius: `${t.radius}px`, bgcolor: t.ground, border: `1px solid ${t.line}` }}>
            <LayersOutlined aria-hidden sx={{ fontSize: 22, color: t.gold800, flexShrink: 0, mt: '1px' }} />
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', lineHeight: 1.4 }}>{tr('included.twoYearIntro')}</Typography>
              {extraOverOneYear > 0 && (
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: t.success, lineHeight: 1.4, mt: 0.25 }}>
                  {tr('included.twoYearExtra', { amount: rupees(extraOverOneYear) })}
                </Typography>
              )}
            </Box>
          </Box>
        )}

        {/* Plan extras typed in Admin, then what every plan includes */}
        <CheckList variant="compact" items={[...(fee.features ?? []), ...HIGHLIGHT_KEYS.map((key) => tr(`included.${key}`))]} />

        <CtaButton
          variant="link"
          size="md"
          href={`#${INCLUDED_SECTION_ID}`}
          endIcon={<ArrowDownwardRounded aria-hidden />}
          sx={{ alignSelf: 'flex-start', minHeight: 44 }}
        >
          {tr('included.seeAll')}
        </CtaButton>
      </Box>

      <Box sx={{ mt: 'auto' }}>
        {isEnrolled ? (
          <CtaButton variant="success" fullWidth onClick={goToApp} endIcon={<NorthEast aria-hidden />}>
            Go to App
          </CtaButton>
        ) : (
          <CtaButton variant={isHighlighted ? 'primary' : 'outline'} fullWidth href="/apply">
            {tr('applyNow')}
          </CtaButton>
        )}
      </Box>
    </Box>
  );
}
