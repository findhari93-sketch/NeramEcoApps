'use client';

import { Grid, Paper, Box, Typography, Chip, Skeleton } from '@neram/ui';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import VerifiedIcon from '@mui/icons-material/Verified';
import PublicIcon from '@mui/icons-material/Public';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';

interface ExamCenterStats {
  total: number;
  high_confidence: number;
  medium_confidence: number;
  low_confidence: number;
  tcs_confirmed: number;
  with_barch: number;
  states_count: number;
  new_this_year: number;
}

interface ExamCentersStatsBarProps {
  stats: ExamCenterStats | null;
  loading?: boolean;
}

export default function ExamCentersStatsBar({ stats, loading }: ExamCentersStatsBarProps) {
  if (loading) {
    return (
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        {[1, 2, 3, 4].map((i) => (
          <Grid item xs={12} sm={6} md={3} key={i}>
            <Paper sx={{ p: 2 }}>
              <Skeleton variant="text" width="60%" />
              <Skeleton variant="text" width="40%" height={40} />
            </Paper>
          </Grid>
        ))}
      </Grid>
    );
  }

  if (!stats) return null;

  const cards = [
    {
      title: 'Total Centers',
      value: stats.total,
      icon: <LocationOnIcon sx={{ color: 'white', fontSize: 20 }} />,
      color: '#1976d2',
      subtitle: `${stats.new_this_year} new this year`,
    },
    {
      title: 'Confidence Breakdown',
      value: null,
      icon: <TrendingUpIcon sx={{ color: 'white', fontSize: 20 }} />,
      color: '#7B1FA2',
      chips: [
        { label: `${stats.high_confidence} HIGH`, color: '#4CAF50' },
        { label: `${stats.medium_confidence} MED`, color: '#FF9800' },
        { label: `${stats.low_confidence} LOW`, color: '#F44336' },
      ],
    },
    {
      title: 'TCS iON Verified',
      value: stats.tcs_confirmed,
      icon: <VerifiedIcon sx={{ color: 'white', fontSize: 20 }} />,
      color: '#2E7D32',
      subtitle: `${Math.round((stats.tcs_confirmed / stats.total) * 100)}% of total`,
    },
    {
      title: 'States Covered',
      value: stats.states_count,
      icon: <PublicIcon sx={{ color: 'white', fontSize: 20 }} />,
      color: '#E65100',
      subtitle: `${stats.with_barch} with B.Arch colleges`,
    },
  ];

  return (
    <Grid container spacing={2} sx={{ mb: 2.5 }}>
      {cards.map((card) => (
        <Grid item xs={12} sm={6} md={3} key={card.title}>
          <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {card.title}
                </Typography>
                {card.value != null ? (
                  <Typography variant="h4" component="div" fontWeight="bold">
                    {card.value}
                  </Typography>
                ) : card.chips ? (
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                    {card.chips.map((chip) => (
                      <Chip
                        key={chip.label}
                        label={chip.label}
                        size="small"
                        sx={{
                          bgcolor: `${chip.color}14`,
                          color: chip.color,
                          fontWeight: 600,
                          fontSize: 11,
                          border: '1px solid',
                          borderColor: `${chip.color}30`,
                          height: 24,
                        }}
                      />
                    ))}
                  </Box>
                ) : null}
                {card.subtitle && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    {card.subtitle}
                  </Typography>
                )}
              </Box>
              <Box sx={{ bgcolor: card.color, borderRadius: 1, p: 0.75, display: 'flex' }}>
                {card.icon}
              </Box>
            </Box>
          </Paper>
        </Grid>
      ))}
    </Grid>
  );
}
