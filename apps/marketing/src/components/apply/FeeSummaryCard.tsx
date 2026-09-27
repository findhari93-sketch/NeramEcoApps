'use client';

import { Box, Paper, Typography } from '@neram/ui';
import CurrencyRupeeOutlined from '@mui/icons-material/CurrencyRupeeOutlined';
import { useTranslations } from 'next-intl';
import { formatRupees } from './ProgrammePicker';

interface FeeSummaryCardProps {
  label: string | null;
  feeAmount: number | null;
  comboExtraFee?: number;
  /** Government-school applicants: the fee is confirmed after scholarship review. */
  scholarship?: boolean;
}

/** Inline, never floating: the programme and its standard fee, on the step that chose them. */
export default function FeeSummaryCard({ label, feeAmount, comboExtraFee = 0, scholarship = false }: FeeSummaryCardProps) {
  const t = useTranslations('apply');
  if (!label) return null;

  return (
    <Paper variant="outlined" sx={{ p: 2, display: 'flex', gap: 1.5, alignItems: 'flex-start', bgcolor: 'grey.50' }}>
      <CurrencyRupeeOutlined color="primary" aria-hidden sx={{ mt: 0.25 }} />
      <Box>
        <Typography variant="subtitle2" fontWeight={600}>
          {t('yourCourse.feeCardTitle')}: {label}
        </Typography>
        {scholarship ? (
          <Typography variant="body2" color="text.secondary">
            {t('yourCourse.feeCardScholarship')}
          </Typography>
        ) : (
          <>
            {feeAmount !== null && (
              <Typography variant="body2">
                {t('yourCourse.standardFee', { amount: formatRupees(feeAmount) })}
              </Typography>
            )}
            {comboExtraFee > 0 && (
              <Typography variant="body2" color="text.secondary">
                {t('yourCourse.comboNote', { amount: formatRupees(comboExtraFee) })}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              {t('yourCourse.feeCardBody')}
            </Typography>
          </>
        )}
      </Box>
    </Paper>
  );
}
