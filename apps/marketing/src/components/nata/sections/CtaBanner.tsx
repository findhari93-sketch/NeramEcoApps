'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import Link from 'next/link';
import { Box, Container, Typography, Button } from '@neram/ui';
import { m3Primary, m3Secondary, m3Tertiary } from '@neram/ui';
import ScrollReveal from '@/components/nata/sections/ScrollReveal';

// ============================================
// TYPES
// ============================================

interface CtaBannerProps {
  locale: string;
}

// ============================================
// DATA
// ============================================

const socialProofItems = [
  { value: '10,000+', label: 'Students', tint: m3Tertiary[80] },
  { value: '50+', label: 'Colleges', tint: m3Secondary[70] },
  { value: '7+', label: 'Free Tools', tint: m3Primary[70] },
];

// ============================================
// ANIMATION VARIANTS
// ============================================

const staggerContainer = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.2,
    },
  },
};

const pillItem = {
  hidden: { opacity: 0, y: 16, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: [0.05, 0.7, 0.1, 1] },
  },
};

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.05, 0.7, 0.1, 1] },
  },
};

// ============================================
// COMPONENT
// ============================================

export default function CtaBanner({ locale }: CtaBannerProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.25 });

  return (
    <Box
      ref={sectionRef}
      component="section"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(135deg, ${m3Primary[30]} 0%, ${m3Secondary[30]} 100%)`,
        py: { xs: 7, sm: 9, md: 11 },
      }}
    >
      {/* Subtle crosshatch geometric pattern overlay */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          opacity: 0.03,
          backgroundImage: `
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 30px,
              rgba(255,255,255,1) 30px,
              rgba(255,255,255,1) 31px
            ),
            repeating-linear-gradient(
              90deg,
              transparent,
              transparent 30px,
              rgba(255,255,255,1) 30px,
              rgba(255,255,255,1) 31px
            )
          `,
          pointerEvents: 'none',
        }}
      />

      {/* Decorative radial glow */}
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 600,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(255,255,255,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <Container maxWidth="md" sx={{ position: 'relative', zIndex: 1 }}>
        <ScrollReveal direction="up" duration={0.7}>
          <Box sx={{ textAlign: 'center' }}>
            {/* Heading */}
            <Typography
              variant="h2"
              sx={{
                fontFamily: '"Poppins", "Plus Jakarta Sans", sans-serif',
                fontWeight: 800,
                fontSize: { xs: '1.6rem', sm: '2rem', md: '2.6rem' },
                lineHeight: 1.2,
                color: '#fff',
                mb: 2,
                letterSpacing: '-0.02em',
              }}
            >
              Prepare for NATA 2026 with India&apos;s First
              <br />
              <Box
                component="span"
                sx={{ color: m3Tertiary[80] }}
              >
                AI-Enabled
              </Box>{' '}
              Learning Platform
            </Typography>

            {/* Subtitle */}
            <Typography
              sx={{
                color: 'rgba(255,255,255,0.8)',
                fontSize: { xs: '0.95rem', md: '1.1rem' },
                lineHeight: 1.6,
                mb: 4.5,
                maxWidth: 520,
                mx: 'auto',
              }}
            >
              Expert coaching, free tools, personalized preparation plans
            </Typography>

            {/* Social proof pills */}
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate={isInView ? 'visible' : 'hidden'}
            >
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: { xs: 1.5, sm: 2 },
                  mb: 4.5,
                }}
              >
                {socialProofItems.map((item) => (
                  <motion.div key={item.label} variants={pillItem}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.2,
                        bgcolor: 'rgba(255,255,255,0.12)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: 2,
                        px: 3,
                        py: 1,
                        minWidth: { xs: 180, sm: 'auto' },
                        justifyContent: { xs: 'center', sm: 'flex-start' },
                        transition: 'all 0.3s ease',
                        '&:hover': {
                          bgcolor: 'rgba(255,255,255,0.18)',
                          transform: 'translateY(-2px)',
                        },
                      }}
                    >
                      <Typography
                        sx={{
                          fontWeight: 800,
                          fontSize: '1.15rem',
                          color: item.tint,
                          lineHeight: 1,
                        }}
                      >
                        {item.value}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: '0.82rem',
                          color: 'rgba(255,255,255,0.7)',
                          fontWeight: 500,
                        }}
                      >
                        {item.label}
                      </Typography>
                    </Box>
                  </motion.div>
                ))}
              </Box>
            </motion.div>

            {/* Buttons */}
            <motion.div
              variants={fadeInUp}
              initial="hidden"
              animate={isInView ? 'visible' : 'hidden'}
              transition={{ delay: 0.5 }}
            >
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  justifyContent: 'center',
                  gap: 2,
                }}
              >
                <Button
                  component={Link}
                  href={`/${locale}/free-trial`}
                  variant="contained"
                  size="large"
                  sx={{
                    background: 'linear-gradient(135deg, #F9A825, #F57F17)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    px: 4.5,
                    py: 1.6,
                    borderRadius: 1.5,
                    textTransform: 'none',
                    boxShadow: '0 4px 20px rgba(249, 168, 37, 0.35)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #FFB938, #F9A825)',
                      boxShadow: '0 6px 28px rgba(249, 168, 37, 0.45)',
                      transform: 'translateY(-1px)',
                    },
                    transition: 'all 0.25s ease',
                    width: { xs: '100%', sm: 'auto' },
                  }}
                >
                  Start Free Trial
                </Button>
                <Button
                  component={Link}
                  href={`/${locale}/coaching`}
                  variant="outlined"
                  size="large"
                  sx={{
                    bgcolor: 'rgba(255,255,255,0.15)',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '0.95rem',
                    px: 4.5,
                    py: 1.6,
                    borderRadius: 1.5,
                    textTransform: 'none',
                    border: '1px solid rgba(255,255,255,0.3)',
                    backdropFilter: 'blur(8px)',
                    '&:hover': {
                      bgcolor: 'rgba(255,255,255,0.22)',
                      border: '1px solid rgba(255,255,255,0.45)',
                      transform: 'translateY(-1px)',
                    },
                    transition: 'all 0.25s ease',
                    width: { xs: '100%', sm: 'auto' },
                  }}
                >
                  Explore Coaching
                </Button>
              </Box>
            </motion.div>
          </Box>
        </ScrollReveal>
      </Container>
    </Box>
  );
}
