'use client';

import { Box, Typography, Grid, Paper } from '@neram/ui';
import { useMicrosoftAuth } from '@neram/auth';
import ProgressCard from '@/components/ProgressCard';

export default function DashboardPage() {
  const { user } = useMicrosoftAuth();

  const progressData = [
    {
      title: 'Mathematics',
      completed: 12,
      total: 20,
      percentage: 60,
      color: '#1976d2',
    },
    {
      title: 'Physics',
      completed: 8,
      total: 15,
      percentage: 53,
      color: '#2e7d32',
    },
    {
      title: 'Chemistry',
      completed: 15,
      total: 18,
      percentage: 83,
      color: '#d32f2f',
    },
    {
      title: 'Biology',
      completed: 10,
      total: 16,
      percentage: 62,
      color: '#ed6c02',
    },
  ];

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
          Welcome back, {user?.name || 'Student'}!
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Continue your learning journey
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Progress Cards */}
        {progressData.map((course) => (
          <Grid item xs={12} sm={6} md={6} lg={3} key={course.title}>
            <ProgressCard
              title={course.title}
              completed={course.completed}
              total={course.total}
              percentage={course.percentage}
              color={course.color}
            />
          </Grid>
        ))}

        {/* Quick Stats */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
              Recent Activity
            </Typography>
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Completed: Quadratic Equations - Chapter 5
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Quiz Score: 85% in Physics - Motion
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                New Assignment: Organic Chemistry Lab Report
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Upcoming Test: Mathematics - Calculus (3 days)
              </Typography>
            </Box>
          </Paper>
        </Grid>

        {/* Upcoming Classes */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
              Upcoming Classes
            </Typography>
            <Box sx={{ mt: 2 }}>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Today, 10:00 AM
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Mathematics - Calculus Basics
                </Typography>
              </Box>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Today, 2:00 PM
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Physics - Thermodynamics
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Tomorrow, 11:00 AM
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Chemistry - Periodic Table
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
