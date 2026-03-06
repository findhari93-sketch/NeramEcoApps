'use client';

import { Box, Typography, Grid, Paper, Chip, Button } from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import Link from 'next/link';
import { NATA_TOOLS } from '@/lib/navigation-data';
import { useExamCountdown } from '@/hooks/useExamCountdown';
import ExamSetupCard from '@/components/exam-setup/ExamSetupCard';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

const quickAccessTools = NATA_TOOLS.filter((t) => !t.comingSoon).slice(0, 5);

export default function DashboardPage() {
  const { user } = useFirebaseAuth();
  const { daysLeft, cardState, nextSession, nextAttempt } = useExamCountdown();

  // Build header chip label based on user state
  const getChipLabel = () => {
    if (cardState === 'applied' && nextAttempt?.session_label && daysLeft !== null) {
      return `${nextAttempt.session_label} · ${daysLeft} days`;
    }
    if (daysLeft !== null && nextSession) {
      return `NATA ${new Date().getFullYear()} · ${daysLeft} days`;
    }
    return null;
  };

  const chipLabel = getChipLabel();

  return (
    <Box>
      {/* Header row */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            Dashboard
          </Typography>
          {chipLabel && (
            <Chip
              label={chipLabel}
              size="small"
              variant="outlined"
              sx={{ fontWeight: 600, fontSize: '0.7rem' }}
            />
          )}
        </Box>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem', mt: 0.5 }}>
          From Cutoffs to Colleges — Your Architecture Exam Companion
        </Typography>
      </Box>

      {/* Exam Setup / Countdown Card */}
      <ExamSetupCard />

      {/* Quick Access */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.7rem' }}>
            Quick Access
          </Typography>
          <Button
            component={Link}
            href="/tools/nata/exam-centers"
            size="small"
            endIcon={<ArrowForwardIcon sx={{ fontSize: '0.8rem !important' }} />}
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem' }}
          >
            All Tools
          </Button>
        </Box>
        <Grid container spacing={1.5}>
          {quickAccessTools.map((tool) => (
            <Grid item xs={6} sm={4} md={2.4} key={tool.href}>
              <Paper
                component={Link}
                href={tool.href}
                sx={{
                  p: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  textDecoration: 'none',
                  transition: 'all 0.15s ease',
                  cursor: 'pointer',
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: 'action.hover',
                  },
                }}
              >
                <Box sx={{ color: 'primary.main', display: 'flex', '& .MuiSvgIcon-root': { fontSize: '1.1rem' } }}>
                  {tool.icon}
                </Box>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 500, color: 'text.primary', lineHeight: 1.3 }}>
                  {tool.title}
                </Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* Recent Activity */}
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.7rem', mb: 1.5 }}>
          Recent Activity
        </Typography>
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            No recent activity. Start using tools to track your progress here.
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
}
