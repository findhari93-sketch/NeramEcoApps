'use client';

import { useState, useEffect } from 'react';
import { Box, Typography, Grid, Paper, Stack, CircularProgress } from '@mui/material';
import DomainIcon from '@mui/icons-material/Domain';
import StarHalfIcon from '@mui/icons-material/StarHalf';
import LeaderboardIcon from '@mui/icons-material/Leaderboard';

export default function CollegeHubOverviewPage() {
  const [stats, setStats] = useState({ total: 0, pending_reviews: 0, verified: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/college-hub/colleges').then((r) => r.json()),
      fetch('/api/college-hub/reviews?status=pending').then((r) => r.json()),
    ])
      .then(([colleges, reviews]) => {
        const all = colleges.data ?? [];
        setStats({
          total: all.length,
          pending_reviews: (reviews.data ?? []).length,
          verified: all.filter((c: { verified: boolean }) => c.verified).length,
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const STAT_CARDS = [
    {
      label: 'Total Colleges',
      value: stats.total,
      icon: <DomainIcon sx={{ color: '#2563eb' }} />,
      color: '#eff6ff',
    },
    {
      label: 'Reviews Pending',
      value: stats.pending_reviews,
      icon: <StarHalfIcon sx={{ color: '#d97706' }} />,
      color: '#fffbeb',
    },
    {
      label: 'Verified Profiles',
      value: stats.verified,
      icon: <LeaderboardIcon sx={{ color: '#16a34a' }} />,
      color: '#f0fdf4',
    },
  ];

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <Box
          sx={{
            width: 42,
            height: 42,
            bgcolor: '#2563eb',
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <DomainIcon sx={{ color: 'white' }} />
        </Box>
        <Typography variant="h5" fontWeight={700}>
          College Hub
        </Typography>
      </Stack>

      {loading ? (
        <CircularProgress />
      ) : (
        <Grid container spacing={2}>
          {STAT_CARDS.map(({ label, value, icon, color }) => (
            <Grid item xs={12} sm={4} key={label}>
              <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, bgcolor: color }}>
                <Stack direction="row" alignItems="center" gap={1.5}>
                  {icon}
                  <Box>
                    <Typography variant="h4" fontWeight={800}>
                      {value}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {label}
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
