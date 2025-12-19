'use client';

import { Grid, Paper, Box, Typography } from '@neram/ui';
import PeopleIcon from '@mui/icons-material/People';
import AssignmentIcon from '@mui/icons-material/Assignment';
import PaymentIcon from '@mui/icons-material/Payment';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  trend?: string;
}

function StatCard({ title, value, icon, color, trend }: StatCardProps) {
  return (
    <Paper
      sx={{
        p: 3,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {title}
          </Typography>
          <Typography variant="h4" component="div" fontWeight="bold">
            {value}
          </Typography>
          {trend && (
            <Typography variant="body2" color="success.main" sx={{ mt: 1 }}>
              {trend}
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            bgcolor: color,
            borderRadius: 2,
            p: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </Box>
      </Box>
    </Paper>
  );
}

export default function DashboardStats() {
  const stats = [
    {
      title: 'Total Students',
      value: '1,234',
      icon: <PeopleIcon sx={{ color: 'white' }} />,
      color: 'primary.main',
      trend: '+12% from last month',
    },
    {
      title: 'Pending Leads',
      value: '45',
      icon: <AssignmentIcon sx={{ color: 'white' }} />,
      color: 'warning.main',
      trend: '8 new today',
    },
    {
      title: 'Pending Payments',
      value: '23',
      icon: <PaymentIcon sx={{ color: 'white' }} />,
      color: 'error.main',
      trend: '5 need verification',
    },
    {
      title: 'Revenue (This Month)',
      value: '₹4.5L',
      icon: <TrendingUpIcon sx={{ color: 'white' }} />,
      color: 'success.main',
      trend: '+18% from last month',
    },
  ];

  return (
    <Grid container spacing={3}>
      {stats.map((stat) => (
        <Grid item xs={12} sm={6} md={3} key={stat.title}>
          <StatCard {...stat} />
        </Grid>
      ))}
    </Grid>
  );
}
