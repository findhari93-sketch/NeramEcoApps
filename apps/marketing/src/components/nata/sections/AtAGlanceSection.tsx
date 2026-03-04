'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Box,
  Container,
  Typography,
  SchoolIcon,
  DashboardIcon,
  TranslateIcon,
  AssignmentIcon,
  AccessTimeIcon,
  RefreshIcon,
  CalendarTodayIcon,
  LanguageIcon,
  m3Primary,
  m3Secondary,
  m3Tertiary,
  m3Neutral,
} from '@neram/ui';
import PublicIcon from '@mui/icons-material/Public';
import type { SvgIconComponent } from '@mui/icons-material';

interface GlanceItem {
  label: string;
  value: string;
  subtext?: string;
  icon: SvgIconComponent;
  tint: string;
  featured?: boolean;
}

const glanceData: GlanceItem[] = [
  { label: 'Conducting Body', value: 'Council of Architecture (CoA)', icon: SchoolIcon, tint: m3Primary[40] },
  { label: 'Exam Level', value: 'National', icon: PublicIcon, tint: m3Primary[40] },
  { label: 'Mode', value: 'Part A (Offline) + Part B (Online Adaptive)', icon: DashboardIcon, tint: m3Secondary[40] },
  { label: 'Medium', value: 'English and Hindi', icon: TranslateIcon, tint: m3Secondary[40] },
  { label: 'Total Marks', value: '200', subtext: 'Part A: 80 + Part B: 120', icon: AssignmentIcon, tint: m3Tertiary[40], featured: true },
  { label: 'Duration', value: '3 Hours', subtext: '90 min each part', icon: AccessTimeIcon, tint: m3Tertiary[40], featured: true },
  { label: 'Maximum Attempts', value: '3 per year', icon: RefreshIcon, tint: m3Primary[40] },
  { label: 'Score Validity', value: '2 academic years', icon: CalendarTodayIcon, tint: m3Secondary[40] },
  { label: 'Website', value: 'www.nata.in', icon: LanguageIcon, tint: m3Primary[40] },
];

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.05, 0.7, 0.1, 1],
    },
  },
};

const featuredCardVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: [0.05, 0.7, 0.1, 1],
    },
  },
};

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

/**
 * Converts a hex color string to an RGB string (e.g., '#1A73E8' -> '26, 115, 232')
 */
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0, 0, 0';
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}

export default function AtAGlanceSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <Box
      component="section"
      ref={ref}
      sx={{
        bgcolor: m3Neutral[99],
        position: 'relative',
        py: { xs: 6, md: 8 },
      }}
    >
      {/* Top gradient line */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '2px',
          background: `linear-gradient(90deg, ${m3Primary[40]}, ${m3Secondary[40]}, ${m3Tertiary[40]})`,
        }}
      />

      <Container maxWidth="lg">
        {/* Heading */}
        <Typography
          variant="h4"
          component="h2"
          sx={{
            textAlign: 'center',
            fontWeight: 700,
            mb: { xs: 4, md: 5 },
            color: m3Neutral[10],
          }}
        >
          NATA 2026 at a Glance
        </Typography>

        {/* Grid of cards */}
        <Box
          component={motion.div}
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
            },
            gap: 2,
          }}
        >
          {glanceData.map((item) => {
            const IconComponent = item.icon;

            return (
              <Box
                key={item.label}
                component={motion.div}
                variants={item.featured ? featuredCardVariants : cardVariants}
                sx={{
                  // Featured cards span 2 columns on md, but NOT on xs/sm
                  ...(item.featured && {
                    gridColumn: { xs: 'span 1', md: 'span 2' },
                  }),
                }}
              >
                <Box
                  sx={{
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: m3Neutral[90],
                    p: 2.5,
                    height: '100%',
                    transition: 'box-shadow 0.3s ease',
                    '&:hover': {
                      boxShadow: `0 0 20px rgba(${hexToRgb(item.tint)}, 0.08) inset`,
                    },
                  }}
                >
                  {/* Icon */}
                  <IconComponent
                    sx={{
                      fontSize: 24,
                      color: item.tint,
                      mb: 1.5,
                    }}
                  />

                  {/* Label */}
                  <Typography
                    variant="overline"
                    sx={{
                      display: 'block',
                      letterSpacing: 1.5,
                      color: 'text.secondary',
                      mb: 0.5,
                    }}
                  >
                    {item.label}
                  </Typography>

                  {/* Value */}
                  <Typography
                    variant={item.featured ? 'h4' : 'h6'}
                    sx={{
                      fontWeight: 700,
                      color: m3Neutral[10],
                      lineHeight: 1.3,
                    }}
                  >
                    {item.value}
                  </Typography>

                  {/* Subtext */}
                  {item.subtext && (
                    <Typography
                      variant="body2"
                      sx={{
                        color: 'text.secondary',
                        mt: 0.5,
                      }}
                    >
                      {item.subtext}
                    </Typography>
                  )}

                  {/* Bottom accent line */}
                  <Box
                    sx={{
                      width: 40,
                      height: 2,
                      bgcolor: item.tint,
                      mt: 2,
                      borderRadius: 1,
                    }}
                  />
                </Box>
              </Box>
            );
          })}
        </Box>
      </Container>
    </Box>
  );
}
