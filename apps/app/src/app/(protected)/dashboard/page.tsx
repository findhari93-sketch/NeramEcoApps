'use client';

import { Box, Typography, Grid, Paper } from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import ToolCard from '@/components/ToolCard';

const tools = [
  {
    title: 'NATA Cutoff Calculator',
    description: 'Calculate your NATA cutoff scores and predict your chances based on previous year trends',
    href: '/tools/cutoff-calculator',
    icon: '🔢',
    color: '#1976d2',
  },
  {
    title: 'College Predictor',
    description: 'Find the best architecture colleges based on your NATA score and preferences',
    href: '/tools/college-predictor',
    icon: '🏫',
    color: '#2e7d32',
  },
  {
    title: 'Exam Centers',
    description: 'Locate NATA exam centers near you with detailed information and directions',
    href: '/tools/exam-centers',
    icon: '📍',
    color: '#ed6c02',
  },
  {
    title: 'Apply for Coaching',
    description: 'Apply for NATA coaching with our streamlined application process',
    href: '/apply',
    icon: '📝',
    color: '#9c27b0',
  },
];

export default function DashboardPage() {
  const { user } = useFirebaseAuth();

  return (
    <Box>
      {/* Welcome Section */}
      <Paper sx={{ p: { xs: 2, md: 3 }, mb: 3, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <Typography
          variant="h4"
          sx={{
            color: 'white',
            fontWeight: 600,
            fontSize: { xs: '1.5rem', md: '2rem' },
          }}
        >
          Welcome back, {user?.name?.split(' ')[0] || 'Student'}!
        </Typography>
        <Typography
          variant="body1"
          sx={{ color: 'rgba(255,255,255,0.9)', mt: 1 }}
        >
          Ready to excel in your NATA preparation?
        </Typography>
      </Paper>

      {/* Quick Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" color="primary" fontWeight={700}>
              12
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Tools Used
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" color="success.main" fontWeight={700}>
              85%
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Progress
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" color="warning.main" fontWeight={700}>
              45
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Days to Exam
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" color="error.main" fontWeight={700}>
              3
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Pending Tasks
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Tools Section */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
          Available Tools
        </Typography>
        <Grid container spacing={2}>
          {tools.map((tool) => (
            <Grid item xs={12} sm={6} md={6} key={tool.href}>
              <ToolCard {...tool} />
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* Recent Activity */}
      <Box>
        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
          Recent Activity
        </Typography>
        <Paper sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            No recent activity. Start using our tools to see your progress here!
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
}
