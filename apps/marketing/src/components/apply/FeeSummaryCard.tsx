'use client';

import { Box, Typography } from '@neram/ui';
import { useTranslations } from 'next-intl';
import { tokens as t } from '@/design-system';
import { formatRupees } from './ProgrammePicker';
import { applyEyebrowSx } from './styles';

interface FeeSummaryCardProps {
  label: string | null;
  feeAmount: number | null;
  comboExtraFee?: number;
  /** Government-school applicants: the fee is confirmed after scholarship review. */
  scholarship?: boolean;
}

const mutedSx = { m: 0, fontSize: 14, lineHeight: 1.5, color: t.inkMuted } as const;

/**
 * Inline, never floating: the programme and its standard fee, on the step that
 * chose them. White card, 1px line, a 3px gold top border, mono "YOUR FEE"
 * eyebrow, programme left and the amount right (they wrap on a phone).
 */
export default function FeeSummaryCard({ label, feeAmount, comboExtraFee = 0, scholarship = false }: FeeSummaryCardProps) {
  const tr = useTranslations('apply');
  if (!label) return null;

  return (
    <Box
      component="section"
      aria-labelledby="apply-fee-card-title"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        bgcolor: t.surface,
        border: `1px solid ${t.line}`,
        borderTop: `3px solid ${t.gold500}`,
        borderRadius: `${t.radius}px`,
        px: 3,
        py: 2.5,
      }}
    >
      <Typography component="h2" id="apply-fee-card-title" sx={applyEyebrowSx}>
        {tr('yourCourse.feeCardTitle')}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 2, rowGap: 0.5 }}>
        <Typography component="p" sx={{ m: 0, fontSize: 17, fontWeight: 700, lineHeight: 1.35, color: t.ink }}>
          {label}
        </Typography>
        {!scholarship && feeAmount !== null && (
          <Typography
            component="p"
            sx={{ m: 0, fontSize: 26, fontWeight: 800, lineHeight: 1.15, color: t.ink, whiteSpace: 'nowrap' }}
          >
            ₹{formatRupees(feeAmount)}
          </Typography>
        )}
      </Box>
      {scholarship ? (
        <Typography component="p" sx={mutedSx}>
          {tr('yourCourse.feeCardScholarship')}
        </Typography>
      ) : (
        <>
          {comboExtraFee > 0 && (
            <Typography component="p" sx={mutedSx}>
              {tr('yourCourse.comboNote', { amount: formatRupees(comboExtraFee) })}
            </Typography>
          )}
          <Typography component="p" sx={mutedSx}>
            {tr('yourCourse.feeCardBody')}
          </Typography>
        </>
      )}
    </Box>
  );
}
