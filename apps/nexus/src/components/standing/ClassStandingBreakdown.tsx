'use client';

import { Box, Typography, alpha, useTheme } from '@neram/ui';
import { BAND_COLOR, type ClassStandingResult, type StandingAudience } from '@/lib/class-standing';

/**
 * "Why this number."
 *
 * Every one of the five components is listed, INCLUDING the ones we could not
 * measure. An unmeasured row is greyed and says so. Omitting it would leave the
 * reader wondering whether tests were counted and scored zero, which is exactly
 * the doubt this panel exists to remove.
 *
 * The weights shown are the effective ones, after renormalisation, so they add
 * up to what actually produced the score rather than to a nominal 100 that
 * includes weight nothing was measured against.
 */
export default function ClassStandingBreakdown({
  standing,
  audience,
}: {
  standing: ClassStandingResult;
  audience: StandingAudience;
}) {
  const theme = useTheme();

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {standing.score === null
          ? standing.detail
          : audience === 'parent'
            ? 'This number is built from five things. Anything we have not recorded is left out rather than counted as zero.'
            : 'Five components, renormalised over what was actually measured. Unmeasured components take their weight with them.'}
      </Typography>

      <Box sx={{ display: 'grid', gap: 1.5 }}>
        {standing.components.map((c) => {
          const color = c.measured
            ? c.score! >= 70
              ? theme.palette.success.main
              : c.score! >= 50
                ? theme.palette.warning.main
                : theme.palette.error.main
            : theme.palette.text.disabled;

          return (
            <Box
              key={c.key}
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: c.measured ? 'action.hover' : alpha(theme.palette.text.disabled, 0.06),
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 1,
                  mb: 0.5,
                }}
              >
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 700, color: c.measured ? 'text.primary' : 'text.disabled' }}
                >
                  {c.label}
                </Typography>
                {c.measured ? (
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexShrink: 0 }}>
                    <Typography variant="caption" color="text.secondary">
                      {c.effectiveWeight}% of the score
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800, color }}>
                      {c.score}%
                    </Typography>
                  </Box>
                ) : (
                  <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }}>
                    Not counted
                  </Typography>
                )}
              </Box>

              {c.measured && (
                <Box
                  role="progressbar"
                  aria-label={c.label}
                  aria-valuenow={c.score ?? 0}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    bgcolor: alpha(color, 0.16),
                    overflow: 'hidden',
                    mb: 0.75,
                  }}
                >
                  <Box
                    sx={{
                      height: '100%',
                      width: `${c.score}%`,
                      bgcolor: color,
                      borderRadius: 3,
                    }}
                  />
                </Box>
              )}

              <Typography
                variant="caption"
                sx={{ color: c.measured ? 'text.secondary' : 'text.disabled' }}
              >
                {audience === 'parent' ? c.parentEvidence : c.evidence}
              </Typography>
            </Box>
          );
        })}
      </Box>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mt: 2, lineHeight: 1.6 }}
      >
        {/* Stated plainly so nobody goes looking for a position in the class. */}
        Bands: Excelling from 85, On Track from 70, Needs Support from 50.
        {audience === 'parent'
          ? ' This is about your child on their own. It is not a rank, and it does not compare them with anyone else.'
          : ' Not a rank, and not compared with the rest of the class.'}
      </Typography>

      {standing.score !== null && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 1 }}
        >
          Based on the last {standing.windowDays} days of classes.
        </Typography>
      )}
    </Box>
  );
}

/** Exported for the card, which tints its own border to match the band. */
export function bandColor(standing: ClassStandingResult): string {
  return BAND_COLOR[standing.band];
}
