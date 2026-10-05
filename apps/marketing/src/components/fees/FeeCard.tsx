'use client';

import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  Divider,
} from '@neram/ui';
import {
  ArrowDownwardRounded,
  CheckCircleOutlined,
  LayersOutlined,
  StarOutlined,
  TrendingUpOutlined,
} from '@mui/icons-material';
import Link from 'next/link';
import type { FeeStructure } from '@neram/database';
import { useApplicationStatus } from '@/hooks/useApplicationStatus';
import { useGoToApp } from '@/hooks/useGoToApp';
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

export default function FeeCard({
  fee,
  paymentMode,
  locale,
  badgeLabel,
  badgeColor = 'success',
  isHighlighted = false,
  isMultiYear = false,
  extraOverOneYear = 0,
  t,
}: FeeCardProps) {
  const { status } = useApplicationStatus();
  const { goToApp } = useGoToApp();
  const isEnrolled = status === 'enrolled' || status === 'partial_payment';
  const discountedPrice = fee.fee_amount - (fee.single_payment_discount || 0);
  const hasDiscount = (fee.single_payment_discount || 0) > 0;
  const hasInstallments = fee.installment_1_amount && fee.installment_2_amount;

  return (
    <Card
      variant={isHighlighted ? 'elevation' : 'outlined'}
      elevation={isHighlighted ? 6 : 0}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        borderColor: isHighlighted ? 'primary.main' : 'divider',
        borderWidth: isHighlighted ? 2 : 1,
        borderRadius: 1,
        overflow: 'visible',
        transition: 'box-shadow 0.2s',
        '&:hover': { boxShadow: 8 },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      {/* Badge */}
      {badgeLabel && (
        <Chip
          label={badgeLabel}
          color={badgeColor}
          size="small"
          icon={badgeColor === 'success' ? <StarOutlined /> : <TrendingUpOutlined />}
          sx={{
            position: 'absolute',
            top: -12,
            left: '50%',
            transform: 'translateX(-50%)',
            fontWeight: 700,
            fontSize: '0.75rem',
            px: 1,
            zIndex: 1,
          }}
        />
      )}

      <CardContent sx={{ flexGrow: 1, p: { xs: 2.5, sm: 3 }, pt: badgeLabel ? 4 : 3 }}>
        {/* Course Name */}
        <Typography
          variant="h6"
          fontWeight={700}
          gutterBottom
          sx={{ fontSize: { xs: '1.05rem', sm: '1.2rem' } }}
        >
          {fee.display_name}
        </Typography>

        {/* Duration */}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {fee.duration}
        </Typography>

        {/* Pricing */}
        {paymentMode === 'single' ? (
          <Box sx={{ mb: 2.5 }}>
            {/* Full Price (strikethrough) */}
            {hasDiscount && (
              <Typography
                variant="body1"
                sx={{
                  textDecoration: 'line-through',
                  color: 'text.secondary',
                  fontSize: '0.95rem',
                }}
              >
                {t('fullPrice')}: {'\u20B9'}{fee.fee_amount.toLocaleString('en-IN')}
              </Typography>
            )}

            {/* Discounted / Actual Price */}
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography
                variant="h4"
                fontWeight={800}
                color="primary.main"
                sx={{ fontSize: { xs: '1.75rem', sm: '2rem' } }}
              >
                {'\u20B9'}{(hasDiscount ? discountedPrice : fee.fee_amount).toLocaleString('en-IN')}
              </Typography>
              {hasDiscount && (
                <Chip
                  label={`${t('save')} ${'\u20B9'}${(fee.single_payment_discount || 0).toLocaleString('en-IN')}`}
                  color="success"
                  size="small"
                  sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                />
              )}
            </Box>

            {fee.combo_extra_fee > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                +{'\u20B9'}{fee.combo_extra_fee.toLocaleString('en-IN')} {t('forCombo')}
              </Typography>
            )}
          </Box>
        ) : (
          <Box sx={{ mb: 2.5 }}>
            {hasInstallments ? (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {t('payInInstallments')}:
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box
                    sx={{
                      p: 1.5,
                      bgcolor: 'primary.50',
                      borderRadius: 0.75,
                      border: 1,
                      borderColor: 'primary.100',
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {t('installment1')}
                    </Typography>
                    <Typography variant="h6" fontWeight={700} color="primary.main">
                      {'\u20B9'}{fee.installment_1_amount?.toLocaleString('en-IN')}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      p: 1.5,
                      bgcolor: 'grey.50',
                      borderRadius: 0.75,
                      border: 1,
                      borderColor: 'grey.200',
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {t('installment2')}
                    </Typography>
                    <Typography variant="h6" fontWeight={700}>
                      {'\u20B9'}{fee.installment_2_amount?.toLocaleString('en-IN')}
                    </Typography>
                  </Box>
                </Box>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 1, fontWeight: 500 }}
                >
                  {t('total')}: {'\u20B9'}{fee.fee_amount.toLocaleString('en-IN')}
                </Typography>
              </>
            ) : (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {t('installmentDetailsComingSoon')}
                </Typography>
                <Typography
                  variant="h4"
                  fontWeight={800}
                  color="primary.main"
                  sx={{ fontSize: { xs: '1.75rem', sm: '2rem' } }}
                >
                  {'\u20B9'}{fee.fee_amount.toLocaleString('en-IN')}
                </Typography>
              </Box>
            )}
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Schedule */}
        {fee.schedule_summary && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {fee.schedule_summary}
          </Typography>
        )}

        {/* A longer plan is the one-year plan stretched over more years */}
        {isMultiYear && (
          <Box
            sx={{
              display: 'flex',
              gap: 1.25,
              p: 1.5,
              mb: 2,
              borderRadius: 1,
              bgcolor: 'grey.50',
              border: 1,
              borderColor: 'grey.200',
            }}
          >
            <LayersOutlined aria-hidden sx={{ fontSize: 22, color: 'primary.main', flexShrink: 0, mt: '1px' }} />
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.4 }}>
                {t('included.twoYearIntro')}
              </Typography>
              {extraOverOneYear > 0 && (
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: 'success.dark', lineHeight: 1.4, mt: 0.25 }}>
                  {t('included.twoYearExtra', { amount: `₹${extraOverOneYear.toLocaleString('en-IN')}` })}
                </Typography>
              )}
            </Box>
          </Box>
        )}

        {/* Plan extras typed in Admin, then what every plan includes */}
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[...(fee.features ?? []), ...HIGHLIGHT_KEYS.map((key) => t(`included.${key}`))].map((feature, i) => (
            <Box component="li" key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <CheckCircleOutlined
                aria-hidden
                sx={{ fontSize: 18, color: 'success.main', mt: '3px', flexShrink: 0 }}
              />
              <Typography sx={{ fontSize: '0.95rem', lineHeight: 1.5 }}>
                {feature}
              </Typography>
            </Box>
          ))}
        </Box>

        <Button
          component="a"
          href={`#${INCLUDED_SECTION_ID}`}
          size="small"
          endIcon={<ArrowDownwardRounded sx={{ fontSize: 18 }} />}
          sx={{ mt: 1.5, ml: -1, minHeight: 44, px: 1, textTransform: 'none', fontWeight: 600 }}
        >
          {t('included.seeAll')}
        </Button>
      </CardContent>

      {/* CTA Button */}
      <Box sx={{ p: { xs: 2.5, sm: 3 }, pt: 0 }}>
        {isEnrolled ? (
          <Button
            variant="contained"
            fullWidth
            size="large"
            onClick={goToApp}
            sx={{
              minHeight: 48,
              fontWeight: 600,
              fontSize: '1rem',
              borderRadius: 1,
              bgcolor: '#2E7D32',
              '&:hover': { bgcolor: '#1B5E20' },
            }}
          >
            Go to App
          </Button>
        ) : (
          <Button
            variant="contained"
            color={isHighlighted ? 'primary' : 'secondary'}
            fullWidth
            size="large"
            component={Link}
            href={`/${locale}/apply`}
            sx={{
              minHeight: 48,
              fontWeight: 600,
              fontSize: '1rem',
              borderRadius: 1,
            }}
          >
            {t('applyNow')}
          </Button>
        )}
      </Box>
    </Card>
  );
}
