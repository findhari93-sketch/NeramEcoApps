'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Box,
  Container,
  Typography,
  LocationOnIcon,
  SchoolIcon,
  CheckCircleIcon,
  m3Secondary,
  m3Neutral,
} from '@neram/ui';
import CalculateIcon from '@mui/icons-material/Calculate';
import PaymentsIcon from '@mui/icons-material/Payments';
import CropIcon from '@mui/icons-material/Crop';
import QuizIcon from '@mui/icons-material/Quiz';
import ScrollReveal from '@/components/nata/sections/ScrollReveal';
import { APP_URL } from '@/lib/seo/constants';
import type { SvgIconComponent } from '@mui/icons-material';

interface ToolItem {
  title: string;
  link: string;
  icon: SvgIconComponent;
}

const freeTools: ToolItem[] = [
  { title: 'Exam Centers', link: `${APP_URL}/tools/nata/exam-centers`, icon: LocationOnIcon },
  { title: 'Cutoff Calculator', link: `${APP_URL}/tools/nata/cutoff-calculator`, icon: CalculateIcon },
  { title: 'College Predictor', link: `${APP_URL}/tools/nata/college-predictor`, icon: SchoolIcon },
  { title: 'Eligibility Checker', link: `${APP_URL}/tools/nata/eligibility-checker`, icon: CheckCircleIcon },
  { title: 'Cost Calculator', link: `${APP_URL}/tools/nata/cost-calculator`, icon: PaymentsIcon },
  { title: 'Image Crop', link: `${APP_URL}/tools/nata/image-crop`, icon: CropIcon },
  { title: 'Question Bank', link: `${APP_URL}/tools/nata/question-bank`, icon: QuizIcon },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

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

export default function FreeToolsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <Box
      component="section"
      ref={ref}
      sx={{
        background: `linear-gradient(180deg, rgba(0, 137, 123, 0.03) 0%, rgba(0, 137, 123, 0.08) 100%)`,
        py: { xs: 6, md: 8 },
      }}
    >
      <Container maxWidth="lg">
        {/* Heading */}
        <ScrollReveal>
          <Typography
            variant="h4"
            component="h2"
            sx={{
              textAlign: 'center',
              fontWeight: 700,
              mb: 1.5,
              background: `linear-gradient(135deg, ${m3Secondary[40]}, ${m3Secondary[60]})`,
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Free NATA Tools
          </Typography>
          <Typography
            variant="body1"
            sx={{
              textAlign: 'center',
              color: 'text.secondary',
              mb: { xs: 4, md: 5 },
              maxWidth: 480,
              mx: 'auto',
            }}
          >
            Use our free tools to prepare smarter for NATA 2026
          </Typography>
        </ScrollReveal>

        {/* Grid of tool cards */}
        <Box
          component={motion.div}
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, 1fr)',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(4, 1fr)',
            },
            gap: { xs: 1.5, md: 2 },
          }}
        >
          {freeTools.map((tool) => {
            const IconComponent = tool.icon;

            return (
              <Box
                key={tool.title}
                component={motion.div}
                variants={cardVariants}
              >
                <Box
                  component="a"
                  href={tool.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    display: 'block',
                    bgcolor: '#FFFFFF',
                    borderRadius: 2,
                    p: { xs: 2, md: 2.5 },
                    textAlign: 'center',
                    textDecoration: 'none',
                    color: 'inherit',
                    height: '100%',
                    borderLeft: '3px solid transparent',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      borderLeftColor: m3Secondary[40],
                      '& .tool-icon-container': {
                        transform: 'translateY(-4px)',
                        boxShadow: `0 8px 20px rgba(0, 137, 123, 0.2)`,
                      },
                    },
                  }}
                >
                  {/* Icon container */}
                  <Box
                    className="tool-icon-container"
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      bgcolor: m3Secondary[90],
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mx: 'auto',
                      transition: 'all 0.3s ease',
                    }}
                  >
                    <IconComponent
                      sx={{
                        fontSize: 28,
                        color: m3Secondary[40],
                      }}
                    />
                  </Box>

                  {/* Tool name */}
                  <Typography
                    variant="subtitle1"
                    sx={{
                      fontWeight: 600,
                      mt: 1.5,
                      color: m3Neutral[10],
                    }}
                  >
                    {tool.title}
                  </Typography>

                  {/* Open link */}
                  <Typography
                    variant="body2"
                    sx={{
                      color: m3Secondary[40],
                      fontWeight: 600,
                      mt: 1,
                    }}
                  >
                    {'Open \u2192'}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Container>
    </Box>
  );
}
