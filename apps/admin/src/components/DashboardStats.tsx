'use client';

import { Grid, Box, Typography } from '@neram/ui';
import PeopleIcon from '@mui/icons-material/People';
import AssignmentIcon from '@mui/icons-material/Assignment';
import PaymentIcon from '@mui/icons-material/Payment';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  trendDirection?: 'up' | 'down';
}

function StatCard({ title, value, icon, trend, trendDirection = 'up' }: StatCardProps) {
  const trendColor = trendDirection === 'up' ? '#16A34A' : '#DC2626';

  return (
    <Box
      sx={{
        p: 2,
        bgcolor: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderRadius: 2,
        height: '100%',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography
            sx={{
              fontSize: 12,
              fontWeight: 500,
              color: '#6B7280',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              mb: 0.75,
            }}
          >
            {title}
          </Typography>
          <Typography
            sx={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#1A1A1A',
              lineHeight: 1.2,
            }}
          >
            {value}
          </Typography>
          {trend && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
              {trendDirection === 'up' ? (
                <ArrowUpwardIcon sx={{ fontSize: 14, color: trendColor }} />
              ) : (
                <ArrowDownwardIcon sx={{ fontSize: 14, color: trendColor }} />
              )}
              <Typography sx={{ fontSize: 12, color: trendColor, fontWeight: 500 }}>
                {trend}
              </Typography>
            </Box>
          )}
        </Box>
        <Box
          sx={{
            color: '#9CA3AF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </Box>
      </Box>
    </Box>
  );
}

export default function DashboardStats() {
  const stats = [
    {
      title: 'Total Students',
      value: '1,234',
      icon: <PeopleIcon sx={{ fontSize: 22 }} />,
      trend: '+12% from last month',
      trendDirection: 'up' as const,
    },
    {
      title: 'Pending Leads',
      value: '45',
      icon: <AssignmentIcon sx={{ fontSize: 22 }} />,
      trend: '8 new today',
      trendDirection: 'up' as const,
    },
    {
      title: 'Pending Payments',
      value: '23',
      icon: <PaymentIcon sx={{ fontSize: 22 }} />,
      trend: '5 need verification',
      trendDirection: 'down' as const,
    },
    {
      title: 'Revenue (This Month)',
      value: '₹4.5L',
      icon: <TrendingUpIcon sx={{ fontSize: 22 }} />,
      trend: '+18% from last month',
      trendDirection: 'up' as const,
    },
  ];

  return (
    <Grid container spacing={2}>
      {stats.map((stat) => (
        <Grid item xs={12} sm={6} md={3} key={stat.title}>
          <StatCard {...stat} />
        </Grid>
      ))}
    </Grid>
  );
}
