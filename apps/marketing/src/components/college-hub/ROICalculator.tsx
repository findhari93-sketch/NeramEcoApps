import { Box, Grid, Paper, Stack, Typography } from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import {
  COURSE_DURATION_YEARS,
  CITY_TIER_LIVING_COST,
  DEFAULT_LIVING_COST,
  MATERIALS_TRAVEL_COST,
} from '@/lib/college-hub/constants';

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
            sx={{ p: 2.5, borderRadius: 2.5, bgcolor: '#fef2f2', borderColor: '#fecaca' }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Total Investment ({COURSE_DURATION_YEARS} years)
            </Typography>
            <Stack gap={0.75} sx={{ mt: 1.5 }}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Tuition Fees</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatLakhs(tuitionTotal)}</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Hostel + Living</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatLakhs(livingTotal)}</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Materials & Travel</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatLakhs(materialsTotal)}</Typography>
              </Stack>
              <Stack
                direction="row"
                justifyContent="space-between"
                sx={{ borderTop: '1px solid #fecaca', pt: 1, mt: 0.5 }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#dc2626' }}>Total</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#dc2626' }}>{formatLakhs(totalCost)}</Typography>
              </Stack>
            </Stack>
          </Paper>
        </Grid>

        {/* Returns side */}
        <Grid item xs={12} sm={6}>
          <Paper
            variant="outlined"
            sx={{ p: 2.5, borderRadius: 2.5, bgcolor: '#f0fdf4', borderColor: '#bbf7d0' }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Expected Returns
            </Typography>
            <Stack gap={0.75} sx={{ mt: 1.5 }}>
              {minSalary && (
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Min Package</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatLakhs(minSalary)}/yr</Typography>
                </Stack>
              )}
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Avg Package</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatLakhs(avgSalary)}/yr</Typography>
              </Stack>
              {maxSalary && (
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Max Package</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatLakhs(maxSalary)}/yr</Typography>
                </Stack>
              )}
              <Stack
                direction="row"
                justifyContent="space-between"
                sx={{ borderTop: '1px solid #bbf7d0', pt: 1, mt: 0.5 }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#16a34a' }}>Payback Period</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#16a34a' }}>~{paybackYears} years</Typography>
              </Stack>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* Disclaimer */}
      <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 1.5 }}>
        <Stack direction="row" gap={0.75} alignItems="flex-start">
          <InfoIcon sx={{ fontSize: 16, color: '#1e40af', mt: 0.25 }} />
          <Typography variant="caption" sx={{ color: '#1e40af' }}>
            Living costs estimated for {getCityTierLabel(citySlug)} city ({city}). Actual costs may vary. Placement data from latest available batch.
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}
