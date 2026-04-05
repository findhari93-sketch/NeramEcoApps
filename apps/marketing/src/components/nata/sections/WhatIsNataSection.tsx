'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Box, Container, Typography } from '@neram/ui';
import { SchoolIcon, m3Primary, m3Tertiary } from '@neram/ui';
import ScrollReveal from '@/components/nata/sections/ScrollReveal';

/** Highlighted phrase wrapper */
function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        bgcolor: m3Primary[95],
        px: 0.5,
        borderRadius: 0.5,
        fontWeight: 600,
        color: m3Primary[30],
      }}
    >
      {children}
    </Box>
  );
}

/** Animated amber underline that grows from 0 to 60px when scrolled into view */
function AmberUnderline() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });

  return (
    <Box ref={ref} sx={{ mt: 1.5, mb: 3 }}>
      <motion.div
        initial={{ width: 0 }}
        animate={isInView ? { width: 60 } : { width: 0 }}
        transition={{ duration: 0.6, delay: 0.3, ease: [0.05, 0.7, 0.1, 1] }}
        style={{
          height: 4,
          backgroundColor: m3Tertiary[40],
          borderRadius: 2,
        }}
      />
    </Box>
  );
}

export default function WhatIsNataSection() {
  return (
    <Box
      component="section"
      sx={{
        bgcolor: 'rgba(26, 115, 232, 0.03)',
        py: { xs: 6, md: 10 },
        px: { xs: 2, md: 0 },
      }}
    >
      <Container maxWidth="lg">
        <ScrollReveal direction="up">
          {/* Decorative school icon */}
          <Box sx={{ mb: 2 }}>
            <SchoolIcon
              sx={{
                fontSize: 48,
                color: m3Primary[80],
                opacity: 0.5,
              }}
            />
          </Box>

          {/* Heading — left-aligned, centered on page */}
          <Box sx={{ maxWidth: 720, mx: 'auto' }}>
            <Typography
              variant="h3"
              component="h2"
              sx={{
                fontWeight: 700,
                textAlign: 'left',
                fontSize: { xs: '1.75rem', md: '2.25rem' },
              }}
            >
              What is NATA?
            </Typography>

            {/* Animated amber underline */}
            <AmberUnderline />

            {/* Content paragraph with highlighted key phrases */}
            <Typography
              variant="body1"
              sx={{
                textAlign: 'left',
                lineHeight: 1.8,
                color: 'text.secondary',
                fontSize: { xs: '0.95rem', md: '1.05rem' },
              }}
            >
              NATA (National Aptitude Test in Architecture) is a national-level
              entrance exam conducted by the{' '}
              <Highlight>Council of Architecture (CoA)</Highlight> since 2006. It
              is{' '}
              <Highlight>
                mandatory for admission to B.Arch programs
              </Highlight>{' '}
              across India. The exam tests a candidate&apos;s aptitude in drawing,
              observation skills, critical thinking, and aesthetic sensitivity,
              the core skills required for a career in architecture. NATA scores
              are accepted by{' '}
              <Highlight>
                hundreds of government and private architecture colleges
              </Highlight>{' '}
              across India.
            </Typography>
          </Box>
        </ScrollReveal>
      </Container>
    </Box>
  );
}
