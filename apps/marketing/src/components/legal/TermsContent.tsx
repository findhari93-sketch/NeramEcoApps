'use client';

import { useTranslations } from 'next-intl';
import { Box, Typography, Divider } from '@neram/ui';

const SECTION_KEYS = [
  'acceptance',
  'definitions',
  'eligibility',
  'enrollment',
  'payment',
  'refundSummary',
  'dataUsage',
  'communication',
  'intellectualProperty',
  'userObligations',
  'prohibitedConduct',
  'scholarship',
  'limitation',
  'indemnification',
  'dispute',
  'modifications',
  'termination',
  'governingLaw',
  'contact',
] as const;

interface TermsContentProps {
  /** If true, renders compact for drawer. If false, renders full page with title. */
  compact?: boolean;
}

export default function TermsContent({ compact = false }: TermsContentProps) {
  const t = useTranslations('terms');

  return (
    <Box>
      {!compact && (
        <>
          <Typography variant="h4" fontWeight={800} gutterBottom>
            {t('pageTitle')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {t('lastUpdated')}
          </Typography>
          <Divider sx={{ mb: 3 }} />
        </>
      )}

      {compact && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
          {t('lastUpdated')}
        </Typography>
      )}

      {SECTION_KEYS.map((key) => (
        <Box key={key} sx={{ mb: compact ? 2.5 : 3.5 }}>
          <Typography
            variant={compact ? 'subtitle1' : 'h6'}
            fontWeight={700}
            sx={{ mb: 1 }}
          >
            {t(`sections.${key}.title`)}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ lineHeight: 1.8, textAlign: 'justify' }}
          >
            {t(`sections.${key}.content`)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
