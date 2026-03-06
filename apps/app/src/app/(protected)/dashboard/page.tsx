'use client';

import { Box, Typography, Grid, Paper, Chip, Button } from '@neram/ui';
import { neramTokens } from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import Link from 'next/link';
import {
  getTimeGreeting,
  getDaysUntilExam,
  NATA_TOOLS,
} from '@/lib/navigation-data';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

// Quick access: first 4 non-coming-soon NATA tools
const quickAccessTools = NATA_TOOLS.filter((t) => !t.comingSoon).slice(0, 4);

export default function DashboardPage() {
  const { user } = useFirebaseAuth();
  const firstName = user?.name?.split(' ')[0] || 'Student';
  const greeting = getTimeGreeting();
  const daysLeft = getDaysUntilExam();

  return (
    <Box>
      {/* Greeting */}
      <Box sx={{ mb: 3 }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            fontSize: { xs: '1.5rem', md: '1.85rem' },
            color: 'text.primary',
          }}
        >
          {greeting}, {firstName}!
        </Typography>
        <Typography
          variant="body1"
          sx={{ color: 'text.secondary', mt: 0.5 }}
        >
          Your NATA 2026 journey continues
        </Typography>
      </Box>

      {/* Exam Countdown */}
      {daysLeft !== null && (
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, md: 2.5 },
            mb: 3,
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            background: `linear-gradient(135deg, ${neramTokens.gold[500]}08 0%, ${neramTokens.blue[500]}06 100%)`,
          }}
        >
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2,
              bgcolor: `${neramTokens.gold[500]}15`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <CalendarTodayIcon sx={{ color: neramTokens.gold[500] }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontWeight: 500 }}>
              Next NATA Exam
            </Typography>
            <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: 'text.primary' }}>
              {daysLeft} days left
            </Typography>
          </Box>
          <Chip
            label="NATA 2026"
            size="small"
            sx={{
              bgcolor: `${neramTokens.gold[500]}12`,
              color: neramTokens.gold[600],
              fontWeight: 600,
              fontSize: '0.7rem',
              display: { xs: 'none', sm: 'flex' },
            }}
          />
        </Paper>
      )}

      {/* Quick Access Tools */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.05rem' }}>
            Quick Access
          </Typography>
          <Button
            component={Link}
            href="/tools/nata/cutoff-calculator"
            size="small"
            sx={{ color: neramTokens.gold[500], textTransform: 'none', fontWeight: 600 }}
            endIcon={<ArrowForwardIcon sx={{ fontSize: '0.9rem !important' }} />}
          >
            All Tools
          </Button>
        </Box>
        <Grid container spacing={2}>
          {quickAccessTools.map((tool) => (
            <Grid item xs={6} sm={3} key={tool.href}>
              <Paper
                component={Link}
                href={tool.href}
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 3,
                  textDecoration: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1,
                  textAlign: 'center',
                  border: '1px solid',
                  borderColor: 'divider',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    borderColor: neramTokens.gold[500],
                    boxShadow: `0 4px 16px ${neramTokens.gold[500]}12`,
                    transform: 'translateY(-2px)',
                  },
                }}
              >
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: 2,
                    bgcolor: `${neramTokens.gold[500]}10`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: neramTokens.gold[500],
                    '& .MuiSvgIcon-root': { fontSize: '1.3rem' },
                  }}
                >
                  {tool.icon}
                </Box>
                <Typography
                  sx={{
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'text.primary',
                    lineHeight: 1.3,
                  }}
                >
                  {tool.title}
                </Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* Recent Activity */}
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.05rem', mb: 2 }}>
          Recent Activity
        </Typography>
        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
            textAlign: 'center',
          }}
        >
          <AccessTimeIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            No recent activity yet. Start using tools to track your progress here!
          </Typography>
          <Button
            component={Link}
            href="/tools/nata/cutoff-calculator"
            variant="outlined"
            size="small"
            sx={{
              mt: 2,
              textTransform: 'none',
              borderColor: neramTokens.gold[500],
              color: neramTokens.gold[600],
              '&:hover': {
                borderColor: neramTokens.gold[600],
                bgcolor: `${neramTokens.gold[500]}08`,
              },
            }}
          >
            Explore Tools
          </Button>
        </Paper>
      </Box>
    </Box>
  );
}
