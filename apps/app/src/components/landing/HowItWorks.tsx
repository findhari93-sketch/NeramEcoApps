'use client';

import { Box, Typography, Grid } from '@neram/ui';
import { neramTokens } from '@neram/ui';
import { motion } from 'framer-motion';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import DashboardIcon from '@mui/icons-material/Dashboard';
import BoltIcon from '@mui/icons-material/Bolt';
import { STEPS } from '@/lib/landing-data';

const ICON_MAP: Record<string, React.ReactNode> = {
  PersonAdd: <PersonAddIcon sx={{ fontSize: 28 }} />,
  Dashboard: <DashboardIcon sx={{ fontSize: 28 }} />,
  Bolt: <BoltIcon sx={{ fontSize: 28 }} />,
};

const MotionBox = motion(Box);

export default function HowItWorks() {
  return (
    <Box
      component="section"
      id="how-it-works"
      sx={{
        bgcolor: neramTokens.navy[800],
        py: { xs: 8, md: 12 },
        px: { xs: 2, md: 4 },
      }}
    >
      <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
        {/* Section header */}
        <Box sx={{ textAlign: 'center', mb: { xs: 5, md: 7 } }}>
          <Typography
            sx={{
              fontFamily: 'var(--font-space-mono), "Space Mono", monospace',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: neramTokens.blue[500],
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              mb: 2,
            }}
          >
            How It Works
          </Typography>
          <Typography
            variant="h2"
            sx={{
              fontFamily: 'var(--font-cormorant), "Cormorant Garamond", serif',
              fontSize: { xs: '2rem', md: '3rem' },
              fontWeight: 700,
              color: neramTokens.cream[100],
            }}
          >
            Start in 3 Simple Steps
          </Typography>
        </Box>

        {/* Steps */}
        <Grid container spacing={{ xs: 4, md: 6 }} alignItems="stretch">
          {STEPS.map((step, i) => (
            <Grid item xs={12} md={4} key={step.number}>
              <MotionBox
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: i * 0.15 }}
                sx={{
                  textAlign: 'center',
                  position: 'relative',
                  height: '100%',
                }}
              >
                {/* Step number */}
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    bgcolor: `${neramTokens.gold[500]}15`,
                    border: `2px solid ${neramTokens.gold[500]}40`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mx: 'auto',
                    mb: 3,
                  }}
                >
                  <Typography
                    sx={{
                      fontFamily: 'var(--font-space-mono), "Space Mono", monospace',
                      fontSize: '1.25rem',
                      fontWeight: 700,
                      color: neramTokens.gold[500],
                    }}
                  >
                    {step.number}
                  </Typography>
                </Box>

                {/* Card */}
                <Box
                  sx={{
                    p: 3,
                    borderRadius: '16px',
                    bgcolor: neramTokens.navy[900],
                    border: `1px solid ${neramTokens.navy[600]}40`,
                  }}
                >
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: '12px',
                      bgcolor: `${neramTokens.blue[500]}15`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: neramTokens.blue[500],
                      mx: 'auto',
                      mb: 2,
                    }}
                  >
                    {ICON_MAP[step.icon]}
                  </Box>
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 700,
                      fontSize: '1.1rem',
                      color: neramTokens.cream[100],
                      mb: 1,
                    }}
                  >
                    {step.title}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      color: neramTokens.cream[300],
                      lineHeight: 1.6,
                      fontSize: '0.85rem',
                    }}
                  >
                    {step.description}
                  </Typography>
                </Box>

                {/* Connecting line (desktop only, between steps) */}
                {i < STEPS.length - 1 && (
                  <Box
                    sx={{
                      display: { xs: 'none', md: 'block' },
                      position: 'absolute',
                      top: 28,
                      right: -24,
                      width: 48,
                      height: 2,
                      bgcolor: `${neramTokens.gold[500]}30`,
                    }}
                  />
                )}
              </MotionBox>
            </Grid>
          ))}
        </Grid>
      </Box>
    </Box>
  );
}
