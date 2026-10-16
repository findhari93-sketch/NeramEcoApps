import { Box, Grid, Paper, Stack, Typography } from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import {
  COURSE_DURATION_YEARS,
  CITY_TIER_LIVING_COST,
  DEFAULT_LIVING_COST,
  MATERIALS_TRAVEL_COST,
} from '@/lib/college-hub/constants';
import { siteTokens } from '@neram/ui/site-tokens';

interface ROICalculatorProps {
  annualFee: number;
  avgSalary: number;
  minSalary: number | null;
  maxSalary: number | null;
  citySlug: string | null;
  city: string;
}

function formatLakhs(val: number): string {
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  return `₹${(val / 1000).toFixed(0)}K`;
}

function getCityTierLabel(citySlug: string | null): string {
  if (!citySlug) return 'Tier 3';
  if (CITY_TIER_LIVING_COST[citySlug] === 180000) return 'Tier 1 (Metro)';
  if (CITY_TIER_LIVING_COST[citySlug] === 150000) return 'Tier 2';
  return 'Tier 3';
}

export default function ROICalculator({ annualFee, avgSalary, minSalary, maxSalary, citySlug, city }: ROICalculatorProps) {
  const livingCost = CITY_TIER_LIVING_COST[citySlug ?? ''] ?? DEFAULT_LIVING_COST;
  const tuitionTotal = annualFee * COURSE_DURATION_YEARS;
  const livingTotal = livingCost * COURSE_DURATION_YEARS;
  const materialsTotal = MATERIALS_TRAVEL_COST * COURSE_DURATION_YEARS;
  const totalCost = tuitionTotal + livingTotal + materialsTotal;
  const paybackYears = Math.round((totalCost / avgSalary) * 10) / 10;

  return (
    <Box>
      <Grid container spacing={2}>
        {/* Investment side */}
        <Grid item xs={12} sm={6}>
          <Paper
            variant="outlined"
            sx={{ p: 2.5, borderRadius: 1, bgcolor: siteTokens.surface, borderColor: siteTokens.line }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700, color: siteTokens.ink, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Total Investment ({COURSE_DURATION_YEARS} years)
            </Typography>
            <Stack gap={0.75} sx={{ mt: 1.5 }}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color={siteTokens.inkMuted}>Tuition Fees</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatLakhs(tuitionTotal)}</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color={siteTokens.inkMuted}>Hostel + Living</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatLakhs(livingTotal)}</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color={siteTokens.inkMuted}>Materials & Travel</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatLakhs(materialsTotal)}</Typography>
              </Stack>
              <Stack
                direction="row"
                justifyContent="space-between"
                sx={{ borderTop: `1px solid ${siteTokens.line}`, pt: 1, mt: 0.5 }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700, color: siteTokens.ink }}>Total</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: siteTokens.ink }}>{formatLakhs(totalCost)}</Typography>
              </Stack>
            </Stack>
          </Paper>
        </Grid>

        {/* Returns side */}
        <Grid item xs={12} sm={6}>
          <Paper
            variant="outlined"
            sx={{ p: 2.5, borderRadius: 1, bgcolor: siteTokens.surface, borderColor: siteTokens.line, boxShadow: `inset 3px 0 0 ${siteTokens.success}` }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700, color: siteTokens.success, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Expected Returns
            </Typography>
            <Stack gap={0.75} sx={{ mt: 1.5 }}>
              {minSalary && (
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color={siteTokens.inkMuted}>Min Package</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatLakhs(minSalary)}/yr</Typography>
                </Stack>
              )}
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color={siteTokens.inkMuted}>Avg Package</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatLakhs(avgSalary)}/yr</Typography>
              </Stack>
              {maxSalary && (
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color={siteTokens.inkMuted}>Max Package</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatLakhs(maxSalary)}/yr</Typography>
                </Stack>
              )}
              <Stack
                direction="row"
                justifyContent="space-between"
                sx={{ borderTop: `1px solid ${siteTokens.line}`, pt: 1, mt: 0.5 }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700, color: siteTokens.success }}>Payback Period</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: siteTokens.success }}>~{paybackYears} years</Typography>
              </Stack>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* Disclaimer */}
      <Box sx={{ mt: 1.5, p: 1.5, bgcolor: siteTokens.ground, border: `1px solid ${siteTokens.line}`, borderRadius: 1 }}>
        <Stack direction="row" gap={0.75} alignItems="flex-start">
          <InfoIcon sx={{ fontSize: 16, color: siteTokens.inkMuted, mt: 0.25 }} />
          <Typography variant="caption" sx={{ color: siteTokens.ink }}>
            Living costs estimated for {getCityTierLabel(citySlug)} city ({city}). Actual costs may vary. Placement data from latest available batch.
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}
