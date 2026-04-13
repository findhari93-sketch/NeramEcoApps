import { Box, Grid, Paper, Stack, Typography, LinearProgress } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import WorkIcon from '@mui/icons-material/Work';
import SchoolIcon from '@mui/icons-material/School';
import type { CollegePlacement } from '@/lib/college-hub/types';

interface PlacementStatsProps {
  placements: CollegePlacement[];
}

function StatCard({
  label,
  value,
  icon,
  color = '#2563eb',
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 1.5, sm: 2 },
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: 2,
          bgcolor: `${color}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color,
        }}
      >
        {icon}
      </Box>
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1 }}>
          {label}
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
          {value}
        </Typography>
      </Box>
    </Paper>
  );
}

export default function PlacementStats({ placements }: PlacementStatsProps) {
  if (placements.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography color="text.secondary" variant="body2">
          Placement data not yet available for this college.
        </Typography>
      </Box>
    );
  }

  // Show latest year
  const latest = placements[0];

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary">
          {latest.academic_year} Placement Report
        </Typography>
        {latest.verified && (
          <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>
            Verified data
          </Typography>
        )}
      </Stack>

      <Grid container spacing={1.5}>
        {latest.placement_rate_percent !== null && (
          <Grid item xs={6} sm={3}>
            <StatCard
              label="Placement Rate"
              value={`${Math.round(latest.placement_rate_percent)}%`}
              icon={<TrendingUpIcon />}
              color="#16a34a"
            />
          </Grid>
        )}
        {latest.average_package_lpa !== null && (
          <Grid item xs={6} sm={3}>
            <StatCard
              label="Avg Package"
              value={`${latest.average_package_lpa} LPA`}
              icon={<WorkIcon />}
              color="#2563eb"
            />
          </Grid>
        )}
        {latest.highest_package_lpa !== null && (
          <Grid item xs={6} sm={3}>
            <StatCard
              label="Highest Package"
              value={`${latest.highest_package_lpa} LPA`}
              icon={<TrendingUpIcon />}
              color="#7c3aed"
            />
          </Grid>
        )}
        {latest.higher_studies_percent !== null && (
          <Grid item xs={6} sm={3}>
            <StatCard
              label="Higher Studies"
              value={`${Math.round(latest.higher_studies_percent)}%`}
              icon={<SchoolIcon />}
              color="#d97706"
            />
          </Grid>
        )}
      </Grid>

      {/* Placement rate bar */}
      {latest.placement_rate_percent !== null && (
        <Box sx={{ mt: 2 }}>
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Students placed ({latest.students_placed ?? '?'} / {latest.total_eligible ?? '?'})
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {Math.round(latest.placement_rate_percent)}%
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={latest.placement_rate_percent}
            sx={{ height: 8, borderRadius: 4, bgcolor: '#e2e8f0', '& .MuiLinearProgress-bar': { bgcolor: '#16a34a' } }}
          />
        </Box>
      )}

      {/* Top recruiters */}
      {latest.top_recruiters && latest.top_recruiters.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
            Top Recruiters
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={0.75}>
            {latest.top_recruiters.map((r) => (
              <Paper
                key={r}
                variant="outlined"
                sx={{ px: 1.25, py: 0.5, borderRadius: 1 }}
              >
                <Typography variant="caption" sx={{ fontWeight: 500 }}>
                  {r}
                </Typography>
              </Paper>
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  );
}
