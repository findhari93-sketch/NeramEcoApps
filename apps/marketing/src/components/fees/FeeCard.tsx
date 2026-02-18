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
  CheckCircleOutlined,
  StarOutlined,
  TrendingUpOutlined,
} from '@mui/icons-material';
import Link from 'next/link';
import type { FeeStructure } from '@neram/database';

interface FeeCardProps {
  fee: FeeStructure;
  paymentMode: 'single' | 'installment';
  locale: string;
  badgeLabel?: string;
  badgeColor?: 'success' | 'info' | 'warning';
  isHighlighted?: boolean;
  t: (key: string) => string;
}

export default function FeeCard({
  fee,
  paymentMode,
  locale,
  badgeLabel,
  badgeColor = 'success',
  isHighlighted = false,
  t,
}: FeeCardProps) {
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
        borderRadius: 3,
        overflow: 'visible',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: 8,
        },
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
                  color: 'text.disabled',
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
                      borderRadius: 1.5,
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
                      borderRadius: 1.5,
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

        {/* Features */}
        {fee.features && fee.features.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {fee.features.map((feature, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <CheckCircleOutlined
                  sx={{ fontSize: 18, color: 'success.main', mt: 0.2, flexShrink: 0 }}
                />
                <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                  {feature}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </CardContent>

      {/* CTA Button */}
      <Box sx={{ p: { xs: 2.5, sm: 3 }, pt: 0 }}>
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
            borderRadius: 2,
          }}
        >
          {t('applyNow')}
        </Button>
      </Box>
    </Card>
  );
}
