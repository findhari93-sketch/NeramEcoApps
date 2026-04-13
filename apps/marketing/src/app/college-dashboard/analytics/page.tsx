'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Paper, CircularProgress,
  Grid, Tabs, Tab,
} from '@mui/material';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PeopleIcon from '@mui/icons-material/People';
import StarIcon from '@mui/icons-material/Star';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import { useCollegeDashboard } from '../context';

interface AnalyticsData {
  page_views_7d: number;
  page_views_30d: number;
  page_views_90d: number;
  lead_count: number;
  review_count: number;
  saves_count: number;
}

function StatCard({
  label, value, icon, subLabel,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  subLabel?: string;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
      <Stack direction="row" alignItems="flex-start" gap={1.5}>
        <Box
          sx={{
            width: 40, height: 40, bgcolor: '#f0fdf4',
            borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#16a34a', flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={700} lineHeight={1}>
            {value.toLocaleString('en-IN')}
          </Typography>
          <Typography variant="body2" fontWeight={500} sx={{ mt: 0.25 }}>{label}</Typography>
          {subLabel && (
            <Typography variant="caption" color="text.secondary">{subLabel}</Typography>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}

export default function CollegeDashboardAnalyticsPage() {
  const { session } = useCollegeDashboard();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewPeriod, setViewPeriod] = useState<7 | 30 | 90>(30);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/college-dashboard/analytics', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { load(); }, [load]);

  const pageViewsForPeriod = !data ? 0
    : viewPeriod === 7 ? data.page_views_7d
    : viewPeriod === 30 ? data.page_views_30d
    : data.page_views_90d;

  return (
    <Stack gap={3}>
      <Stack direction="row" alignItems="center" gap={1.5}>
        <Box
          sx={{
            width: 42, height: 42, bgcolor: '#1d4ed8',
            borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <AnalyticsIcon sx={{ color: 'white' }} />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={700}>Analytics</Typography>
          <Typography variant="caption" color="text.secondary">
            Track how students discover and engage with your college
          </Typography>
        </Box>
      </Stack>

      {loading && <CircularProgress />}

      {!loading && data && (
        <Stack gap={3}>
          {/* Page views with period toggle */}
          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Stack direction="row" alignItems="center" gap={1}>
                <VisibilityIcon sx={{ color: '#1d4ed8', fontSize: 20 }} />
                <Typography variant="subtitle1" fontWeight={700}>Page Views</Typography>
              </Stack>
              <Tabs
                value={viewPeriod}
                onChange={(_, v) => setViewPeriod(v)}
                sx={{ minHeight: 'auto', '& .MuiTab-root': { minHeight: 32, py: 0.5, fontSize: 12 } }}
              >
                <Tab label="7 days" value={7} />
                <Tab label="30 days" value={30} />
                <Tab label="90 days" value={90} />
              </Tabs>
            </Stack>
            <Typography variant="h3" fontWeight={800} color="#1d4ed8">
              {pageViewsForPeriod.toLocaleString('en-IN')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              students viewed your college page in the last {viewPeriod} days
            </Typography>
          </Paper>

          {/* Other stats */}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                label="Total Leads"
                value={data.lead_count}
                icon={<PeopleIcon />}
                subLabel="Students who clicked I'm Interested"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                label="Approved Reviews"
                value={data.review_count}
                icon={<StarIcon />}
                subLabel="Verified student reviews"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <StatCard
                label="College Saves"
                value={data.saves_count}
                icon={<BookmarkIcon />}
                subLabel="Students who saved your college"
              />
            </Grid>
          </Grid>
        </Stack>
      )}
    </Stack>
  );
}
