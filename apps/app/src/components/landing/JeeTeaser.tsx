'use client';

import { Box, Typography, Button, Chip } from '@neram/ui';
import { neramTokens } from '@neram/ui';
import { motion } from 'framer-motion';
import Link from 'next/link';

const MotionBox = motion(Box);

export default function JeeTeaser() {
  return (
    <Box
      component="section"
      sx={{
        bgcolor: neramTokens.navy[900],
        py: { xs: 6, md: 10 },
        px: { xs: 2, md: 4 },
      }}
    >
      <MotionBox
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5 }}
        sx={{
          maxWidth: 700,
          mx: 'auto',
          p: { xs: 3, md: 5 },
          borderRadius: '20px',
          bgcolor: neramTokens.navy[800],
          border: `1px solid ${neramTokens.blue[500]}25`,
          position: 'relative',
          overflow: 'hidden',
          textAlign: 'center',
        }}
      >
        {/* Blueprint bg inside card */}
        <Box
          className="ai-blueprint-bg"
          sx={{ position: 'absolute', inset: 0, opacity: 0.3, pointerEvents: 'none' }}
        />

        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Chip
            label="Coming 2026"
            size="small"
            sx={{
              bgcolor: `${neramTokens.blue[500]}20`,
              color: neramTokens.blue[400],
              fontFamily: 'var(--font-space-mono), monospace',
              fontSize: '0.65rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              mb: 3,
              borderRadius: '6px',
            }}
          />
          <Typography
            variant="h3"
            sx={{
              fontFamily: 'var(--font-cormorant), "Cormorant Garamond", serif',
              fontSize: { xs: '1.75rem', md: '2.25rem' },
              fontWeight: 700,
              color: neramTokens.cream[100],
              mb: 2,
            }}
          >
            JEE Paper 2 Tools{' '}
            <Box component="span" className="ai-blue-gradient">
              Coming Soon
            </Box>
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: neramTokens.cream[300],
              mb: 4,
              fontSize: '0.9rem',
              lineHeight: 1.6,
              maxWidth: 500,
              mx: 'auto',
            }}
          >
            Rank predictor, seat matrix, and eligibility checker for JEE B.Arch admission.
            Sign up now to get notified when they launch.
          </Typography>
          <Button
            component={Link}
            href="/login"
            variant="outlined"
            sx={{
              color: neramTokens.blue[400],
              borderColor: `${neramTokens.blue[500]}40`,
              fontWeight: 600,
              px: 4,
              py: 1.25,
              borderRadius: '10px',
              textTransform: 'none',
              minHeight: 48,
              '&:hover': {
                borderColor: neramTokens.blue[500],
                bgcolor: `${neramTokens.blue[500]}10`,
              },
            }}
          >
            Notify Me
          </Button>
        </Box>
      </MotionBox>
    </Box>
  );
}
