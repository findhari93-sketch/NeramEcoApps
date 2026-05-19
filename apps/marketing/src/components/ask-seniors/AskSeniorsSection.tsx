'use client';

import Link from 'next/link';
import { Box, Typography, Button } from '@neram/ui';
import type { AskSeniorsEvent, AskSeniorsCollege } from '@neram/database';
import CollegeScrollStrip from './CollegeScrollStrip';

interface AskSeniorsSectionProps {
  event: AskSeniorsEvent;
  colleges: AskSeniorsCollege[];
}

const GOLD = '#e8a020';

const stats = [
  { value: '50+', label: 'Colleges' },
  { value: 'Free', label: 'For All Students' },
  { value: 'Annual', label: 'June/July' },
];

export default function AskSeniorsSection({ colleges }: AskSeniorsSectionProps) {
  const mid = Math.ceil(colleges.length / 2);
  const row1 = colleges.slice(0, mid);
  const row2 = colleges.slice(mid);

  return (
    <Box
      component="section"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        bgcolor: '#0d0d0d',
        py: { xs: 6, md: 9 },
        textAlign: 'center',

        // Radial glow pseudo-element
        '&::before': {
          content: '""',
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 700,
          height: 320,
          background:
            'radial-gradient(ellipse, rgba(232,160,32,0.07) 0%, transparent 70%)',
          pointerEvents: 'none',
        },
      }}
    >
      {/* Content */}
      <Box sx={{ position: 'relative', zIndex: 1 }}>

        {/* 1. Overline label */}
        <Typography
          variant="overline"
          sx={{
            color: GOLD,
            letterSpacing: 3,
            fontWeight: 700,
            display: 'block',
            mb: 1.5,
            fontSize: '0.72rem',
          }}
        >
          FREE ONLINE EVENT
        </Typography>

        {/* 2. Title */}
        <Typography
          variant="h2"
          component="h2"
          sx={{
            fontWeight: 900,
            fontSize: { xs: '2rem', md: '3rem' },
            lineHeight: 1.1,
            mb: 2.5,
            background: `linear-gradient(90deg, ${GOLD}, #fbbf24, ${GOLD})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          #AskSeniors
        </Typography>

        {/* 3. Description */}
        <Typography
          sx={{
            color: 'text.secondary',
            maxWidth: 500,
            mx: 'auto',
            lineHeight: 1.7,
            mb: 4,
            px: { xs: 2, md: 0 },
          }}
        >
          Real answers from current students at Tamil Nadu&apos;s top architecture colleges.
          Before counselling. Before you decide.
        </Typography>

        {/* 4. Stats row */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'row' },
            justifyContent: 'center',
            gap: { xs: 4, md: 6 },
            mb: 5,
            flexWrap: 'wrap',
          }}
        >
          {stats.map((stat) => (
            <Box key={stat.label} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
              <Typography
                sx={{
                  color: GOLD,
                  fontSize: '1.75rem',
                  fontWeight: 900,
                  lineHeight: 1,
                }}
              >
                {stat.value}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: 'text.disabled', fontSize: '0.75rem' }}
              >
                {stat.label}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* 5. Two scroll rows */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 0 }}>
          <CollegeScrollStrip colleges={row1} direction="forward" durationMs={32000} />
          <CollegeScrollStrip colleges={row2} direction="reverse" durationMs={38000} />
        </Box>

        {/* 6. Hover hint */}
        <Typography
          variant="caption"
          sx={{
            color: 'text.disabled',
            display: 'block',
            mt: 1.5,
            mb: 4,
          }}
        >
          Hover any row to pause
        </Typography>

        {/* 7. CTA row */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 2,
            flexWrap: 'wrap',
            px: { xs: 2, md: 0 },
          }}
        >
          {/* Primary button */}
          <Button
            component={Link}
            href="/ask-seniors#register"
            variant="contained"
            size="large"
            sx={{
              background: `linear-gradient(135deg, ${GOLD}, #f59e0b)`,
              color: '#000',
              fontWeight: 800,
              px: 4,
              textTransform: 'none',
              '&:hover': {
                background: `linear-gradient(135deg, #f59e0b, ${GOLD})`,
                transform: 'translateY(-1px)',
                boxShadow: '0 6px 24px rgba(232,160,32,0.35)',
              },
              transition: 'all 0.25s ease',
            }}
          >
            Register for Free →
          </Button>

          {/* Outlined button */}
          <Button
            component={Link}
            href="/ask-seniors#colleges"
            variant="outlined"
            size="large"
            sx={{
              borderColor: 'rgba(232,160,32,0.4)',
              color: GOLD,
              px: 3,
              textTransform: 'none',
              fontWeight: 600,
              '&:hover': {
                borderColor: GOLD,
                bgcolor: 'rgba(232,160,32,0.07)',
                transform: 'translateY(-1px)',
              },
              transition: 'all 0.25s ease',
            }}
          >
            See All Colleges
          </Button>

          {/* Free indicator */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
            }}
          >
            {/* Pulsing green dot */}
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: '#22c55e',
                flexShrink: 0,
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 1 },
                  '50%': { opacity: 0.4 },
                },
                animation: 'pulse 2s ease-in-out infinite',
              }}
            />
            <Typography
              sx={{
                color: 'text.disabled',
                fontSize: 13,
              }}
            >
              Free for all students
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
