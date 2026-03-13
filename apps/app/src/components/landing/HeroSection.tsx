'use client';

import { Box, Typography, Button, Stack } from '@neram/ui';
import { neramTokens } from '@neram/ui';
import Link from 'next/link';
import BlueprintBackground from './BlueprintBackground';

const HERO_STATS = [
  { value: '5,000+', label: 'Students' },
  { value: '5,000+', label: 'Colleges' },
  { value: '100%', label: 'Free' },
];

export default function HeroSection() {
  return (
    <Box
      component="section"
      sx={{
        position: 'relative',
        minHeight: { xs: 'calc(100vh - 64px)', md: 'calc(100vh - 72px)' },
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        bgcolor: neramTokens.navy[900],
        overflow: 'hidden',
        px: { xs: 2, md: 4 },
        py: { xs: 6, md: 8 },
      }}
    >
      <BlueprintBackground />

      {/* Content */}
      <Box
        sx={{
          position: 'relative',
          zIndex: 2,
          textAlign: 'center',
          maxWidth: 800,
          mx: 'auto',
        }}
      >
        {/* Overline badge */}
        <Box
          className="ai-animate-fade-down ai-stagger-1"
          sx={{
            display: 'inline-block',
            mb: 3,
            px: 2.5,
            py: 0.75,
            borderRadius: '100px',
            border: `1px solid ${neramTokens.gold[500]}40`,
            bgcolor: `${neramTokens.gold[500]}10`,
          }}
        >
          <Typography
            sx={{
              fontFamily: '"SFMono-Regular", "Cascadia Code", "Consolas", monospace',
              fontSize: { xs: '0.65rem', md: '0.75rem' },
              fontWeight: 700,
              color: neramTokens.gold[400],
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
            }}
          >
            Free NATA Preparation App
          </Typography>
        </Box>

        {/* H1 Headline */}
        <Typography
          variant="h1"
          className="ai-animate-fade-up ai-stagger-2"
          sx={{
            fontFamily: 'var(--font-dm-sans), "DM Sans", sans-serif',
            fontSize: { xs: '2.5rem', sm: '3.5rem', md: '4.5rem' },
            fontWeight: 700,
            lineHeight: 1.1,
            color: neramTokens.cream[100],
            mb: 3,
          }}
        >
          Master NATA with{' '}
          <Box
            component="span"
            className="ai-gold-gradient"
            sx={{ display: { xs: 'block', sm: 'inline' } }}
          >
            AI-Powered Tools
          </Box>
        </Typography>

        {/* Subtitle */}
        <Typography
          variant="body1"
          className="ai-animate-fade-up ai-stagger-3"
          sx={{
            fontSize: { xs: '1rem', md: '1.2rem' },
            color: neramTokens.cream[200],
            maxWidth: 600,
            mx: 'auto',
            mb: 4,
            lineHeight: 1.6,
          }}
        >
          Cutoff calculator, college predictor for 5,000+ colleges, exam center finder,
          question bank — everything you need to crack NATA 2026.
        </Typography>

        {/* CTAs */}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          justifyContent="center"
          className="ai-animate-fade-up ai-stagger-4"
          sx={{ mb: 5 }}
        >
          <Button
            component={Link}
            href="/login"
            variant="contained"
            size="large"
            sx={{
              bgcolor: neramTokens.gold[500],
              color: neramTokens.navy[950],
              fontWeight: 700,
              fontSize: '1rem',
              px: 5,
              py: 1.75,
              borderRadius: '12px',
              textTransform: 'none',
              minHeight: 56,
              boxShadow: `0 8px 32px ${neramTokens.gold[500]}40`,
              '&:hover': {
                bgcolor: neramTokens.gold[400],
                boxShadow: `0 12px 40px ${neramTokens.gold[500]}50`,
                transform: 'translateY(-2px)',
              },
              transition: 'all 0.3s ease',
            }}
          >
            Get Started Free
          </Button>
          <Button
            href="#tools"
            variant="outlined"
            size="large"
            sx={{
              color: neramTokens.cream[100],
              borderColor: `${neramTokens.cream[100]}30`,
              fontSize: '1rem',
              px: 5,
              py: 1.75,
              borderRadius: '12px',
              textTransform: 'none',
              minHeight: 56,
              '&:hover': {
                borderColor: neramTokens.cream[100],
                bgcolor: `${neramTokens.cream[100]}08`,
              },
              transition: 'all 0.3s ease',
            }}
          >
            Explore Tools
          </Button>
        </Stack>

        {/* Stats row */}
        <Stack
          direction="row"
          spacing={{ xs: 3, md: 5 }}
          justifyContent="center"
          divider={
            <Box sx={{ width: '1px', bgcolor: `${neramTokens.cream[100]}15`, alignSelf: 'stretch' }} />
          }
          className="ai-animate-fade-up ai-stagger-5"
        >
          {HERO_STATS.map((stat) => (
            <Box key={stat.label} sx={{ textAlign: 'center' }}>
              <Typography
                sx={{
                  fontFamily: '"SFMono-Regular", "Cascadia Code", "Consolas", monospace',
                  fontSize: { xs: '1.25rem', md: '1.5rem' },
                  fontWeight: 700,
                  color: neramTokens.gold[500],
                }}
              >
                {stat.value}
              </Typography>
              <Typography
                sx={{
                  fontSize: { xs: '0.7rem', md: '0.8rem' },
                  color: neramTokens.cream[300],
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {stat.label}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Box>

      {/* Bottom gradient fade */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 120,
          background: `linear-gradient(transparent, ${neramTokens.navy[900]})`,
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />
    </Box>
  );
}
