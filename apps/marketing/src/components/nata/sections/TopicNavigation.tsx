'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import Link from 'next/link';
import { Box, Container, Typography } from '@neram/ui';
import { m3Primary, m3Secondary, m3Neutral } from '@neram/ui';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { spokePages, type SpokePage } from '../data/spokePages';

interface TopicNavigationProps {
  locale: string;
}

// ============================================
// ANIMATION VARIANTS
// ============================================

const staggerContainer = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.05, 0.7, 0.1, 1] },
  },
};

// ============================================
// SUB-COMPONENTS
// ============================================

function FeaturedCard({ page, locale }: { page: SpokePage; locale: string }) {
  const IconComp = page.icon;

  return (
    <Link
      href={`/${locale}/nata-2026/${page.slug}`}
      style={{ textDecoration: 'none', display: 'block', height: '100%' }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2.5,
          height: '100%',
          p: 0.5,
          borderLeft: '3px solid transparent',
          transition: 'all 0.3s ease',
          '&:hover': {
            borderLeftColor: page.tintDark,
          },
          '&:hover .icon-circle': {
            transform: 'scale(1.1)',
          },
          '&:hover .arrow-icon': {
            transform: 'translateX(4px)',
            color: page.tintDark,
          },
        }}
      >
        <Box
          className="icon-circle"
          sx={{
            width: 56,
            height: 56,
            minWidth: 56,
            borderRadius: '50%',
            bgcolor: page.tint,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          <IconComp sx={{ fontSize: 26, color: page.tintDark }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontWeight: 700,
              fontSize: '1.05rem',
              color: m3Neutral[10],
              lineHeight: 1.3,
              mb: 0.3,
            }}
          >
            {page.title}
          </Typography>
          <Typography
            sx={{
              fontSize: '0.82rem',
              color: m3Neutral[50],
              lineHeight: 1.45,
            }}
          >
            {page.desc}
          </Typography>
        </Box>
        <ArrowForwardIcon
          className="arrow-icon"
          sx={{
            fontSize: 20,
            color: m3Neutral[70],
            transition: 'all 0.3s ease',
            flexShrink: 0,
          }}
        />
      </Box>
    </Link>
  );
}

function RegularCard({ page, locale }: { page: SpokePage; locale: string }) {
  const IconComp = page.icon;

  return (
    <Link
      href={`/${locale}/nata-2026/${page.slug}`}
      style={{ textDecoration: 'none', display: 'block', height: '100%' }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          height: '100%',
          p: 0.5,
          transition: 'all 0.3s ease',
          '&:hover .icon-circle': {
            transform: 'scale(1.1)',
          },
          '&:hover .arrow-icon': {
            transform: 'translateX(4px)',
            color: page.tintDark,
          },
        }}
      >
        <Box
          className="icon-circle"
          sx={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            bgcolor: page.tint,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 1.5,
            transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          <IconComp sx={{ fontSize: 22, color: page.tintDark }} />
        </Box>
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: '0.92rem',
            color: m3Neutral[10],
            lineHeight: 1.3,
            mb: 0.4,
          }}
        >
          {page.title}
        </Typography>
        <Typography
          sx={{
            fontSize: '0.78rem',
            color: m3Neutral[50],
            lineHeight: 1.45,
            mb: 1.5,
            flex: 1,
          }}
        >
          {page.desc}
        </Typography>
        <ArrowForwardIcon
          className="arrow-icon"
          sx={{
            fontSize: 18,
            color: m3Neutral[70],
            transition: 'all 0.3s ease',
          }}
        />
      </Box>
    </Link>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function TopicNavigation({ locale }: TopicNavigationProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.15 });

  return (
    <Box
      ref={sectionRef}
      component="section"
      sx={{
        bgcolor: m3Neutral[99],
        py: { xs: 6, sm: 8, md: 10 },
      }}
    >
      <Container maxWidth="lg">
        {/* Section heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, ease: [0.05, 0.7, 0.1, 1] }}
        >
          <Box sx={{ textAlign: 'center', mb: { xs: 4, md: 5 } }}>
            <Typography
              variant="h2"
              sx={{
                fontFamily: '"Poppins", "Plus Jakarta Sans", sans-serif',
                fontWeight: 800,
                fontSize: { xs: '1.6rem', sm: '2rem', md: '2.4rem' },
                lineHeight: 1.2,
                mb: 1.5,
                background: `linear-gradient(135deg, ${m3Primary[40]} 0%, ${m3Secondary[40]} 100%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Explore NATA 2026 Topics
            </Typography>
            <Typography
              sx={{
                color: m3Neutral[50],
                fontSize: { xs: '0.95rem', md: '1.05rem' },
                maxWidth: 480,
                mx: 'auto',
                lineHeight: 1.6,
              }}
            >
              Quick links to everything about the NATA exam
            </Typography>
          </Box>
        </motion.div>

        {/* Bento Grid */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
              gap: 2.5,
              width: '100%',
            }}
          >
            {spokePages.map((page) => (
              <Box
                key={page.slug}
                sx={{
                  gridColumn: { xs: 'span 1', md: page.featured ? 'span 2' : 'span 1' },
                  borderRadius: 2,
                  bgcolor: '#fff',
                  border: `1px solid ${m3Neutral[90]}`,
                  p: { xs: 2, sm: 2.5 },
                  cursor: 'pointer',
                  transition: 'all 0.3s cubic-bezier(0.2, 0, 0, 1)',
                  overflow: 'hidden',
                  '&:hover': {
                    borderColor: page.tintDark,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                    transform: 'translateY(-4px)',
                  },
                }}
              >
                <motion.div
                  variants={fadeInUp}
                  style={{ height: '100%' }}
                >
                  {page.featured ? (
                    <FeaturedCard page={page} locale={locale} />
                  ) : (
                    <RegularCard page={page} locale={locale} />
                  )}
                </motion.div>
              </Box>
            ))}
          </Box>
        </motion.div>
      </Container>
    </Box>
  );
}
