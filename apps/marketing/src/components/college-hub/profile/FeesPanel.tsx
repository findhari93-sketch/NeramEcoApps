import { Box, Typography } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { CollegeDetail, CollegeListItem } from '@/lib/college-hub/types';
import { annualFee } from '@/lib/college-hub/detail-content';
import { formatRupees, formatRupeesFull, shortName } from '@/lib/college-hub/format';
import { ctaBg } from '../directory/hub-styles';
import FeeBreakdown from '../FeeBreakdown';
import { siteTokens } from '@neram/ui/site-tokens';
import { alpha } from '@mui/material/styles';

export interface FeePosition {
  low: number;
  high: number;
  /** 0 to 1 along the low..high bar (clamped). */
  at: number;
  where: 'low' | 'middle' | 'high' | 'below' | 'above';
}

/** Where a college's fee sits among similar colleges; null without two other fees. */
export function feePosition(fee: number | null, similar: Array<Pick<CollegeListItem, 'annual_fee_approx' | 'annual_fee_min'>>): FeePosition | null {
  if (fee == null) return null;
  const fees = similar.map((s) => s.annual_fee_approx ?? s.annual_fee_min).filter((f): f is number => !!f);
  if (fees.length < 2) return null;
  const low = Math.min(...fees);
  const high = Math.max(...fees);
  if (fee < low) return { low, high, at: 0, where: 'below' };
  if (fee > high) return { low, high, at: 1, where: 'above' };
  const at = high === low ? 0.5 : (fee - low) / (high - low);
  return { low, high, at, where: at < 0.34 ? 'low' : at > 0.66 ? 'high' : 'middle' };
}

const WHERE_TEXT: Record<FeePosition['where'], string> = {
  low: 'sits at the low end',
  middle: 'sits in the middle',
  high: 'sits at the high end',
  below: 'costs less than all of them',
  above: 'costs more than all of them',
};

/** Fees section body (canvas: fee rows + "Against similar colleges"). */
export default function FeesPanel({ college, similar, stateName }: { college: CollegeDetail; similar: CollegeListItem[]; stateName: string }) {
  const fee = annualFee(college);
  const pos = feePosition(fee?.amount ?? null, similar);
  const name = shortName(college);
  const rows: Array<{ item: string; value: string; tag?: string; missing?: boolean }> = fee
    ? [
        { item: 'Tuition, per year', value: formatRupeesFull(fee.amount), tag: fee.from ? 'From' : 'Approx.' },
        ...(!fee.from ? [{ item: 'Tuition, 5 years', value: formatRupeesFull(fee.amount * 5), tag: 'Estimate' }] : []),
      ]
    : [{ item: 'Tuition, per year', value: 'Not published', missing: true }];

  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5 }}>
        <Box sx={{ flex: '1 1 340px', minWidth: 0 }}>
          {college.fees.length > 0 ? (
            <FeeBreakdown fees={college.fees} />
          ) : (
            <Box component="dl" sx={{ m: 0, border: '1px solid', borderColor: siteTokens.line, borderRadius: 1, overflow: 'hidden' }}>
              {rows.map((r, i) => (
                <Box key={r.item} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, px: 2.25, py: 1.75, borderTop: i ? '1px solid' : 0, borderColor: siteTokens.line }}>
                  <Box component="dt" sx={{ fontSize: '0.92rem', color: siteTokens.inkMuted }}>{r.item}</Box>
                  <Box component="dd" sx={{ m: 0, display: 'flex', alignItems: 'center', gap: 1, fontSize: '1rem', fontWeight: r.missing ? 500 : 700, color: r.missing ? siteTokens.inkMuted : siteTokens.ink, fontVariantNumeric: 'tabular-nums' }}>
                    {r.value}
                    {r.tag && (
                      <Box component="span" sx={{ fontSize: '0.72rem', fontWeight: 600, px: 0.75, py: 0.25, borderRadius: 1, bgcolor: siteTokens.surfaceHover, color: siteTokens.inkMuted }}>
                        {r.tag}
                      </Box>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {pos && fee && (
          <Box sx={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 1.5, p: 2.25, borderRadius: 1, bgcolor: siteTokens.surfaceHover }}>
            <Typography component="h3" sx={{ m: 0, fontSize: '1rem', fontWeight: 700 }}>
              Against similar colleges
            </Typography>
            <Typography sx={{ m: 0, fontSize: '0.9rem', lineHeight: 1.5, color: siteTokens.inkMuted }}>
              Similar {stateName} colleges charge {formatRupees(pos.low)} to {formatRupees(pos.high)} a year. {name} {WHERE_TEXT[pos.where]}.
            </Typography>
            <Box aria-hidden sx={{ position: 'relative', height: 44, mx: 1, mt: 0.5 }}>
              <Box sx={{ position: 'absolute', left: 0, right: 0, top: 12, height: 8, borderRadius: `${siteTokens.radiusPill}px`, bgcolor: siteTokens.navy700 }} />
              <Box
                sx={{ position: 'absolute', left: `calc(${pos.at * 100}% - 8px)`, top: 8, width: 16, height: 16, borderRadius: '50%', bgcolor: ctaBg, border: '3px solid', borderColor: siteTokens.surface, boxSizing: 'border-box', boxShadow: `0 1px 3px ${alpha(siteTokens.navy900, 0.3)}` }}
              />
              <Box component="span" sx={{ position: 'absolute', left: 0, top: 28, fontSize: '0.75rem', color: siteTokens.inkMuted }}>{formatRupees(pos.low)}</Box>
              <Box component="span" sx={{ position: 'absolute', right: 0, top: 28, fontSize: '0.75rem', color: siteTokens.inkMuted }}>{formatRupees(pos.high)}</Box>
            </Box>
          </Box>
        )}
      </Box>
      <Typography sx={{ m: 0, display: 'flex', gap: 1, fontSize: '0.86rem', lineHeight: 1.5, color: siteTokens.inkMuted }}>
        <InfoOutlinedIcon aria-hidden sx={{ fontSize: 17, mt: '2px', flex: '0 0 auto' }} />
        Fees can differ by quota and category. Confirm the current amount with the college before you pay.
      </Typography>
    </>
  );
}
