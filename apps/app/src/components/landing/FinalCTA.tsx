'use client';

import { Box, Typography, Button, Stack } from '@neram/ui';
import { neramTokens } from '@neram/ui';
import { motion } from 'framer-motion';
import Link from 'next/link';

const MotionBox = motion(Box);

export default function FinalCTA() {
  return (
    <Box
      component="section"
      sx={{
        bgcolor: neramTokens.navy[900],
        position: 'relative',
        overflow: 'hidden',
        py: { xs: 8, md: 12 },
        px: { xs: 2, md: 4 },
      }}
    >
      {/* Blueprint bg */}
      <Box
        className="ai-blueprint-bg"
        sx={{ position: 'absolute', inset: 0, opacity: 0.3, pointerEvents: 'none' }}
      />

      {/* Radial glow */}
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 600,
          height: 400,
          borderRadius: '50%',
          background: `radial-gradient(ellipse, ${neramTokens.gold[500]}10 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      <MotionBox
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.6 }}
        sx={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 600, mx: 'auto' }}
      >
        <Typography
          variant="h2"
          sx={{
            fontFamily: 'var(--font-cormorant), "Cormorant Garamond", serif',
            fontSize: { xs: '2rem', md: '3rem' },
            fontWeight: 700,
            color: neramTokens.cream[100],
            mb: 2,
          }}
        >
          Ready to Ace{' '}
          <Box component="span" className="ai-gold-gradient">
            NATA 2026?
          </Box>
        </Typography>
        <Typography
          variant="body1"
          sx={{
            color: neramTokens.cream[300],
            fontSize: { xs: '1rem', md: '1.1rem' },
            mb: 4,
            lineHeight: 1.6,
          }}
        >
          Join 5,000+ students already using aiArchitek to prepare smarter.
        </Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
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
            Start Free Now
          </Button>
        </Stack>
      </MotionBox>
    </Box>
  );
}
