'use client';

import { Box, Container, Grid, Typography, Button } from '@neram/ui';

import BlueprintBackground from './BlueprintBackground';
import ArchitecturalSVG from './ArchitecturalSVG';
import ClockCanvas from './ClockCanvas';
import AnnounceBadge from './AnnounceBadge';
import TamilTag from './TamilTag';
import RankBar from './RankBar';
import FloatingToolBadge from './FloatingToolBadge';
import AiArchitekPill from './AiNataPill';
import MicrosoftBadge from './MicrosoftBadge';
import HeroBottomStrip from './HeroBottomStrip';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';

/**
 * NewHeroSection — aiArchitek Era hero with scoped dark theme.
 *
 * Wraps itself in a nested ThemeProvider so the rest of the page
 * stays on the existing marketing light theme.
 */
export default function NewHeroSection() {
  return (
    <Box
      component="section"
      sx={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        overflow: 'hidden',
        bgcolor: 'background.default',
      }}
    >
      {/* Background layers */}
      <BlueprintBackground />
      <ArchitecturalSVG />

      {/* aiArchitek pill (top-right, desktop only) */}
      <AiArchitekPill />

      {/* Main content grid */}
      <Container
        maxWidth="lg"
        sx={{
          position: 'relative',
          zIndex: 10,
          pt: { xs: '70px', md: '80px', lg: '50px' },
          pb: { xs: '60px', md: '80px', lg: '70px' },
        }}
      >
        <Grid
          container
          direction={{ xs: 'column', md: 'row' }}
          alignItems="center"
          spacing={{ xs: 3, md: 0 }}
          sx={{}}
        >
          {/* LEFT: Text content */}
          <Grid item xs={12} md={6}>
            <Box sx={{ px: { xs: 0, md: 2 }, overflow: 'hidden' }}>
              <AnnounceBadge />
              <TamilTag />

              {/* Main headline */}
              <Typography
                variant="h1"
                component="h1"
                sx={{
                  mb: 1.25,
                  fontSize: { xs: '2rem', sm: '2.5rem', md: '3.5rem', lg: '3.5rem' },
                  lineHeight: 1.05,
                  opacity: 0,
                  transform: 'translateY(20px)',
                  animation: 'neramFadeUp 0.9s ease forwards',
                  animationDelay: '0s',
                  '& em': {
                    fontStyle: 'italic',
                    color: 'primary.main',
                  },
                  '& .ai-word': {
                    position: 'relative',
                    display: 'inline-block',
                    '&::after': {
                      content: '""',
                      position: 'absolute',
                      bottom: 2,
                      left: 0,
                      right: 0,
                      height: 3,
                      background: 'linear-gradient(90deg, #1a8fff, #e8a020)',
                      borderRadius: '2px',
                      transformOrigin: 'left',
                      transform: 'scaleX(0)',
                      animation: 'neramLineGrow 1.2s ease forwards, neramLineBlink 0.8s ease-in-out 2.6s infinite',
                    },
                  },
                }}
              >
                Your Time to Crack{' '}
                <br />
                <em>NATA & JEE Paper 2</em>{' '}
                <br />
                with <span className="ai-word">AI</span>
              </Typography>

              {/* Subhead */}
              <Typography
                variant="subtitle1"
                component="p"
                sx={{
                  color: 'text.secondary',
                  maxWidth: { xs: '100%', md: 480 },
                  fontSize: { xs: '13px', md: '16px' },
                  wordBreak: 'break-word',
                  mb: { xs: 2, md: 3 },
                  opacity: 0,
                  transform: 'translateY(16px)',
                  animation: 'neramFadeUp 0.9s ease forwards',
                  animationDelay: '0.15s',
                  '& strong': {
                    color: 'text.primary',
                    fontWeight: 500,
                  },
                }}
              >
                Live classes. Intelligent tools. Real results.
                <br />
                <strong>Nexus</strong> — an AI-powered NATA prep companion trusted by
                AIR toppers across JEE Paper 2 &amp; NATA nationwide in India.
              </Typography>

              {/* Rank proof bar */}
              <RankBar />

              {/* CTAs */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  flexWrap: 'wrap',
                  opacity: 0,
                  transform: 'translateY(16px)',
                  animation: 'neramFadeUp 0.9s ease forwards',
                  animationDelay: '0.3s',
                }}
              >
                <Button
                  variant="contained"
                  size="large"
                  href={`${APP_URL}/tools`}
                  sx={{
                    width: { xs: '100%', md: 'auto' },
                    px: { xs: 2.5, md: 3.5 },
                    py: { xs: 1.25, md: 1.75 },
                    fontSize: { xs: '12px', md: '14px' },
                    fontWeight: 700,
                    display: 'inline-flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 1.25,
                    '& .arrow': {
                      fontSize: '18px',
                      transition: 'transform 0.3s',
                    },
                    '&:hover .arrow': {
                      transform: 'translateX(4px)',
                    },
                  }}
                >
                  Explore aiArchitek Free Tool
                  <span className="arrow">&rarr;</span>
                </Button>

              </Box>

              {/* Microsoft Education badge */}
              <MicrosoftBadge />
            </Box>
          </Grid>

          {/* RIGHT: Clock + floating badges */}
          <Grid item xs={12} md={6}>
            <Box sx={{ position: 'relative' }}>
              <ClockCanvas />

              {/* Floating tool badges (desktop only) */}
              <FloatingToolBadge
                icon="✂️"
                label="Cut Off Calculator"
                position="t1"
                href={`${APP_URL}/tools/nata/cutoff-calculator`}
                sx={{ display: 'flex' }}
              />
              <FloatingToolBadge
                icon="🎯"
                label="College Predictor"
                position="t2"
                href={`${APP_URL}/tools/nata/college-predictor`}
                sx={{ display: 'flex' }}
              />
              <FloatingToolBadge
                icon="📚"
                label="Question Bank"
                position="t3"
                href={`${APP_URL}/tools/nata/question-bank`}
                sx={{ display: 'flex' }}
              />
            </Box>
          </Grid>
        </Grid>
      </Container>

      {/* Bottom strip */}
      <HeroBottomStrip />
    </Box>
  );
}
