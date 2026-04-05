'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import Link from 'next/link';
import {
  Box,
  Container,
  Typography,
  Grid,
  Chip,
  Button,
} from '@neram/ui';
import { m3Primary, m3Secondary, m3Tertiary, m3Neutral } from '@neram/ui';
import AssignmentIcon from '@mui/icons-material/Assignment';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import RefreshIcon from '@mui/icons-material/Refresh';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SchoolIcon from '@mui/icons-material/School';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AnimatedCounter from '@/components/nata/sections/AnimatedCounter';

// ============================================
// TYPES
// ============================================

interface HeroSectionProps {
  locale: string;
}

// ============================================
// DATA
// ============================================

const stats = [
  {
    value: 200,
    label: 'Total Marks',
    icon: AssignmentIcon,
    tint: m3Tertiary[90],
    tintDark: m3Tertiary[40],
    useCounter: true,
  },
  {
    value: '3 Hours',
    label: 'Duration',
    icon: AccessTimeIcon,
    tint: m3Secondary[90],
    tintDark: m3Secondary[40],
    useCounter: false,
  },
  {
    value: 'Up to 2',
    label: 'Attempts',
    icon: RefreshIcon,
    tint: m3Primary[90],
    tintDark: m3Primary[40],
    useCounter: false,
  },
  {
    value: 'Hybrid',
    label: 'Mode',
    icon: DashboardIcon,
    tint: m3Neutral[90],
    tintDark: m3Neutral[40],
    useCounter: false,
  },
];

const quickFacts = [
  { icon: SchoolIcon, label: 'Exam', value: 'NATA 2026' },
  { icon: AccountBalanceIcon, label: 'Conducted By', value: 'CoA (Council of Architecture)' },
  { icon: AssignmentIcon, label: 'Total Marks', value: '200' },
  { icon: AccessTimeIcon, label: 'Duration', value: '3 Hours' },
  { icon: RefreshIcon, label: 'Max Attempts', value: '2 (Phase 1)' },
  { icon: CalendarTodayIcon, label: 'Score Validity', value: '1 Year' },
];

// ============================================
// ANIMATION VARIANTS
// ============================================

const fadeInLeft = {
  hidden: { opacity: 0, x: -30 },
  visible: { opacity: 1, x: 0 },
};

const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const staggerContainer = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.3,
    },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

const cardReveal = {
  hidden: { opacity: 0, scale: 0.9, x: 30 },
  visible: { opacity: 1, scale: 1, x: 0 },
};

// ============================================
// COMPONENT
// ============================================

export default function HeroSection({ locale }: HeroSectionProps) {
  const heroRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(heroRef, { once: true, amount: 0.2 });

  return (
    <Box
      ref={heroRef}
      component="section"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(135deg, ${m3Primary[20]} 0%, ${m3Primary[35]} 100%)`,
        py: { xs: 6, sm: 8, md: 10 },
        minHeight: { md: '70vh' },
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {/* SVG geometric pattern overlay */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          opacity: 0.03,
          backgroundImage: `repeating-linear-gradient(
            45deg,
            transparent,
            transparent 20px,
            rgba(255,255,255,1) 20px,
            rgba(255,255,255,1) 21px
          )`,
          pointerEvents: 'none',
        }}
      />

      {/* Decorative teal blob */}
      <Box
        sx={{
          position: 'absolute',
          top: { xs: -80, md: -60 },
          right: { xs: -80, md: -40 },
          width: { xs: 250, md: 300 },
          height: { xs: 250, md: 300 },
          borderRadius: '50%',
          background: m3Secondary[40],
          opacity: 0.1,
          filter: 'blur(80px)',
          pointerEvents: 'none',
        }}
      />

      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Grid container spacing={{ xs: 4, md: 5 }} alignItems="center">
          {/* Left column */}
          <Grid item xs={12} md={7}>
            {/* Badge chip */}
            <motion.div
              variants={fadeInLeft}
              initial="hidden"
              animate={isInView ? 'visible' : 'hidden'}
              transition={{ duration: 0.6, ease: [0.05, 0.7, 0.1, 1] }}
            >
              <Chip
                label="NATA 2026 Complete Guide"
                sx={{
                  bgcolor: 'rgba(255,255,255,0.18)',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  letterSpacing: '0.02em',
                  mb: 2.5,
                  px: 0.5,
                  height: 32,
                  border: '1px solid rgba(255,255,255,0.2)',
                  backdropFilter: 'blur(6px)',
                  '& .MuiChip-label': { px: 1.5 },
                }}
              />
            </motion.div>

            {/* Heading */}
            <motion.div
              variants={fadeInLeft}
              initial="hidden"
              animate={isInView ? 'visible' : 'hidden'}
              transition={{ duration: 0.7, ease: [0.05, 0.7, 0.1, 1] }}
            >
              <Typography
                variant="h1"
                sx={{
                  fontFamily: '"Poppins", "Plus Jakarta Sans", sans-serif',
                  fontWeight: 800,
                  fontSize: { xs: '2rem', sm: '2.5rem', md: '3.2rem' },
                  lineHeight: 1.15,
                  color: '#fff',
                  mb: 2,
                  letterSpacing: '-0.02em',
                }}
              >
                NATA 2026: Complete{' '}
                <Box
                  component="span"
                  sx={{
                    background: `linear-gradient(135deg, ${m3Tertiary[70]}, ${m3Tertiary[80]})`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Exam Guide
                </Box>
              </Typography>
            </motion.div>

            {/* Subtitle */}
            <motion.div
              variants={fadeInLeft}
              initial="hidden"
              animate={isInView ? 'visible' : 'hidden'}
              transition={{
                duration: 0.7,
                delay: 0.15,
                ease: [0.05, 0.7, 0.1, 1],
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  color: 'rgba(255,255,255,0.85)',
                  fontWeight: 400,
                  fontSize: { xs: '1rem', sm: '1.1rem', md: '1.2rem' },
                  lineHeight: 1.6,
                  mb: 3.5,
                  maxWidth: 520,
                }}
              >
                Everything you need to know about NATA 2026
              </Typography>
            </motion.div>

            {/* Stats strip */}
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate={isInView ? 'visible' : 'hidden'}
            >
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 1.5,
                  mb: 4,
                }}
              >
                {stats.map((stat) => {
                  const IconComp = stat.icon;
                  return (
                    <motion.div key={stat.label} variants={staggerItem} transition={{ duration: 0.5, ease: [0.05, 0.7, 0.1, 1] }}>
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          bgcolor: 'rgba(255,255,255,0.1)',
                          backdropFilter: 'blur(8px)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: 2,
                          px: { xs: 2, sm: 2.5 },
                          py: { xs: 1.5, sm: 2 },
                          minWidth: { xs: 'calc(50% - 12px)', sm: 'auto' },
                          flex: { xs: '1 1 calc(50% - 12px)', sm: '0 0 auto' },
                          transition: 'all 0.3s ease',
                          '&:hover': {
                            bgcolor: 'rgba(255,255,255,0.15)',
                            transform: 'translateY(-2px)',
                          },
                        }}
                      >
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            bgcolor: stat.tint,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            mb: 0.8,
                          }}
                        >
                          <IconComp sx={{ fontSize: 18, color: stat.tintDark }} />
                        </Box>
                        {stat.useCounter ? (
                          <AnimatedCounter
                            target={stat.value as number}
                            duration={1500}
                            sx={{
                              fontWeight: 700,
                              fontSize: { xs: '1.1rem', sm: '1.2rem' },
                              color: '#fff',
                              lineHeight: 1.2,
                            }}
                          />
                        ) : (
                          <Typography
                            sx={{
                              fontWeight: 700,
                              fontSize: { xs: '1.1rem', sm: '1.2rem' },
                              color: '#fff',
                              lineHeight: 1.2,
                            }}
                          >
                            {stat.value}
                          </Typography>
                        )}
                        <Typography
                          sx={{
                            fontSize: '0.7rem',
                            color: 'rgba(255,255,255,0.65)',
                            fontWeight: 500,
                            mt: 0.3,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                          }}
                        >
                          {stat.label}
                        </Typography>
                      </Box>
                    </motion.div>
                  );
                })}
              </Box>
            </motion.div>

            {/* Buttons */}
            <motion.div
              variants={fadeInUp}
              initial="hidden"
              animate={isInView ? 'visible' : 'hidden'}
              transition={{
                duration: 0.6,
                delay: 0.45,
                ease: [0.05, 0.7, 0.1, 1],
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  gap: 2,
                }}
              >
                <Button
                  component={Link}
                  href={`/${locale}/nata-2026/eligibility`}
                  variant="contained"
                  size="large"
                  sx={{
                    background: 'linear-gradient(135deg, #F9A825, #F57F17)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    px: 4,
                    py: 1.5,
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
                  Check Eligibility
                </Button>
                <Button
                  component={Link}
                  href={`/${locale}/nata-2026/how-to-apply`}
                  variant="outlined"
                  size="large"
                  sx={{
                    bgcolor: 'rgba(255,255,255,0.15)',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '0.95rem',
                    px: 4,
                    py: 1.5,
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
                  How to Apply
                </Button>
              </Box>
            </motion.div>
          </Grid>

          {/* Right column - Quick Facts GlassCard */}
          <Grid item xs={12} md={5}>
            <motion.div
              variants={cardReveal}
              initial="hidden"
              animate={isInView ? 'visible' : 'hidden'}
              transition={{
                duration: 0.7,
                delay: 0.2,
                ease: [0.05, 0.7, 0.1, 1],
              }}
            >
              <Box
                sx={{
                  background: 'rgba(255, 255, 255, 0.12)',
                  backdropFilter: 'blur(24px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 2,
                  p: { xs: 2.5, sm: 3 },
                  mt: { xs: 1, md: 0 },
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: `0 8px 32px rgba(0, 0, 0, 0.1), 0 0 0 1px ${m3Primary[40]}20`,
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '1px',
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                    pointerEvents: 'none',
                  },
                }}
              >
                <Typography
                  variant="h6"
                  sx={{
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: { xs: '1.05rem', sm: '1.15rem' },
                    mb: 2.5,
                    letterSpacing: '-0.01em',
                  }}
                >
                  NATA 2026 Quick Facts
                </Typography>

                {quickFacts.map((fact, index) => {
                  const FactIcon = fact.icon;
                  return (
                    <Box key={fact.label}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          py: 1.4,
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                          <FactIcon
                            sx={{
                              fontSize: 20,
                              color: 'rgba(255,255,255,0.6)',
                            }}
                          />
                          <Typography
                            sx={{
                              color: 'rgba(255,255,255,0.7)',
                              fontSize: '0.85rem',
                              fontWeight: 400,
                            }}
                          >
                            {fact.label}
                          </Typography>
                        </Box>
                        <Typography
                          sx={{
                            color: '#fff',
                            fontWeight: 600,
                            fontSize: '0.88rem',
                            textAlign: 'right',
                          }}
                        >
                          {fact.value}
                        </Typography>
                      </Box>
                      {index < quickFacts.length - 1 && (
                        <Box
                          sx={{
                            height: '1px',
                            bgcolor: 'rgba(255,255,255,0.12)',
                          }}
                        />
                      )}
                    </Box>
                  );
                })}
              </Box>
            </motion.div>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
