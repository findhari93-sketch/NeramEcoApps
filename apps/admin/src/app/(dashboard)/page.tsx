'use client';

import { Box, Typography } from '@neram/ui';
import DashboardStats from '@/components/DashboardStats';

export default function DashboardPage() {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
        Dashboard
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Welcome to the Neram Classes Admin Panel
      </Typography>

      <DashboardStats />

      <Box sx={{ mt: 4 }}>
        <Typography variant="h6" gutterBottom>
          Recent Activity
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Recent activity will be displayed here
        </Typography>
      </Box>
    </Box>
  );
}
