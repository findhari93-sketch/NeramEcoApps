'use client';

import { Box, Typography, Grid, Paper } from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import ToolCard from '@/components/ToolCard';

const nataTools = [
  {
    title: 'Exam Centers',
    description: 'Find NATA exam centers near you with detailed information and directions',
    href: '/tools/nata/exam-centers',
    icon: '📍',
    color: '#ed6c02',
  },
  {
    title: 'Cutoff Calculator',
    description: 'Calculate your NATA cutoff scores and predict your chances',
    href: '/tools/nata/cutoff-calculator',
    icon: '🔢',
    color: '#1976d2',
  },
  {
    title: 'College Predictor',
    description: 'Find architecture colleges matching your NATA score',
    href: '/tools/nata/college-predictor',
    icon: '🏫',
    color: '#2e7d32',
  },
  {
    title: 'Question Bank',
    description: 'Community-shared exam questions from past NATA sessions',
    href: '/tools/nata/question-bank',
    icon: '📚',
    color: '#7b1fa2',
  },
  {
    title: 'Seat Matrix',
    description: 'View seat availability across architecture colleges',
    href: '/tools/nata/seat-matrix',
    icon: '📊',
    color: '#0288d1',
    comingSoon: true,
  },
  {
    title: 'College Reviews',
    description: 'Read authentic student reviews of architecture colleges',
    href: '/tools/nata/college-reviews',
    icon: '⭐',
    color: '#f9a825',
    comingSoon: true,
  },
  {
    title: 'Eligibility Checker',
    description: 'Check if you meet NATA eligibility criteria',
    href: '/tools/nata/eligibility-checker',
    icon: '✅',
    color: '#388e3c',
    comingSoon: true,
  },
  {
    title: 'Cost Calculator',
    description: 'Estimate total education cost through NATA route',
    href: '/tools/nata/cost-calculator',
    icon: '💰',
    color: '#e65100',
    comingSoon: true,
  },
];

const jeeTools = [
  {
    title: 'Seat Matrix',
    description: 'JEE Paper 2 seat availability in NITs, IITs and more',
    href: '/tools/jee/seat-matrix',
    icon: '📊',
    color: '#0288d1',
    comingSoon: true,
  },
  {
    title: 'Eligibility Checker',
    description: 'Check JEE Paper 2 eligibility and attempt limits',
    href: '/tools/jee/eligibility-checker',
    icon: '✅',
    color: '#388e3c',
    comingSoon: true,
  },
  {
    title: 'Rank Predictor',
    description: 'Predict your JEE Paper 2 rank from expected score',
    href: '/tools/jee/rank-predictor',
    icon: '🎯',
    color: '#c62828',
    comingSoon: true,
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
          Ready to excel in your architecture entrance preparation?
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

      {/* NATA Tools Section */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
          NATA Tools
        </Typography>
        <Grid container spacing={2}>
          {nataTools.map((tool) => (
            <Grid item xs={12} sm={6} md={4} key={tool.href}>
              <ToolCard {...tool} />
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* JEE Paper 2 Tools Section */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
          JEE Paper 2 Tools
        </Typography>
        <Grid container spacing={2}>
          {jeeTools.map((tool) => (
            <Grid item xs={12} sm={6} md={4} key={tool.href}>
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
