'use client';

import Link from 'next/link';
import { Box, Typography, Button } from '@neram/ui';
import type { AskSeniorsEvent, AskSeniorsCollege } from '@neram/database';
import CollegeScrollStrip from './CollegeScrollStrip';

interface AskSeniorsSectionProps {
  event: AskSeniorsEvent;
  colleges: AskSeniorsCollege[];
}

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
        py: { xs: 7, md: 10 },
        textAlign: 'center',
        // Deep dark base with a subtle top/bottom border glow
        background: 'linear-gradient(180deg, #080c14 0%, #0b1020 50%, #080c14 100%)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',

        // Central radial glow
        '&::before': {
          content: '""',
          position: 'absolute',
          top: '30%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: { xs: '100%', md: '800px' },
          height: '400px',
          background:
            'radial-gradient(ellipse at center, rgba(232,160,32,0.09) 0%, transparent 65%)',
          pointerEvents: 'none',
          zIndex: 0,
        },
        // Subtle grid overlay
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          pointerEvents: 'none',
          zIndex: 0,
        },
      }}
    >
      <Box sx={{ position: 'relative', zIndex: 1 }}>

        {/* Event badge */}
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 0.75,
            mb: 3,
            borderRadius: 20,
            background: 'linear-gradient(135deg, rgba(232,160,32,0.15), rgba(251,191,36,0.08))',
            border: '1px solid rgba(232,160,32,0.3)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <Box
            sx={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              bgcolor: '#22c55e',
              '@keyframes livePulse': {
                '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                '50%': { opacity: 0.5, transform: 'scale(0.85)' },
              },
              animation: 'livePulse 2s ease-in-out infinite',
            }}
          />
          <Typography
            sx={{
              color: '#e8a020',
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}
          >
            Free Online Event
          </Typography>
        </Box>

        {/* Title */}
        <Typography
          component="h2"
          sx={{
            fontWeight: 900,
            fontSize: { xs: '2.25rem', sm: '2.75rem', md: '3.5rem' },
            lineHeight: 1.05,
            mb: 2,
            background: 'linear-gradient(135deg, #fbbf24 0%, #e8a020 40%, #f59e0b 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '-0.5px',
          }}
        >
          #AskSeniors
        </Typography>

        {/* Tagline */}
        <Typography
          sx={{
            color: 'rgba(255,255,255,0.55)',
            maxWidth: 420,
            mx: 'auto',
            lineHeight: 1.65,
            fontSize: { xs: '0.95rem', md: '1rem' },
            mb: 4,
            px: { xs: 2.5, md: 0 },
          }}
        >
          Current B.Arch students from{' '}
          <Box component="strong" sx={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>
            Tamil Nadu&apos;s top colleges
          </Box>{' '}
          answer your questions. Before TNEA counselling.
        </Typography>

        {/* Stats row — pill cards */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            gap: { xs: 2, md: 3 },
            mb: 5,
            flexWrap: 'wrap',
            px: { xs: 2, md: 0 },
          }}
        >
          {[
            { value: `${colleges.length}+`, label: 'Colleges' },
            { value: '100%', label: 'Free' },
            { value: 'Live Q&A', label: 'Annual' },
          ].map(({ value, label }) => (
            <Box
              key={label}
              sx={{
                px: { xs: 2.5, md: 3 },
                py: 1.5,
                borderRadius: 3,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                backdropFilter: 'blur(4px)',
                minWidth: 90,
              }}
            >
              <Typography
                sx={{
                  color: '#e8a020',
                  fontSize: { xs: '1.35rem', md: '1.5rem' },
                  fontWeight: 900,
                  lineHeight: 1.1,
                }}
              >
                {value}
              </Typography>
              <Typography
                sx={{
                  color: 'rgba(255,255,255,0.35)',
                  fontSize: '0.7rem',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  mt: 0.25,
                  fontWeight: 600,
                }}
              >
                {label}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Scroll strips */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <CollegeScrollStrip colleges={row1} direction="forward" durationMs={32000} />
          <CollegeScrollStrip colleges={row2} direction="reverse" durationMs={40000} />
        </Box>

        {/* CTAs */}
        <Box
          sx={{
            mt: 5,
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'center',
            alignItems: 'center',
            gap: { xs: 2, sm: 2 },
            px: { xs: 3, md: 0 },
          }}
        >
          <Button
            component={Link}
            href="/ask-seniors#register"
            variant="contained"
            size="large"
            fullWidth={false}
            sx={{
              width: { xs: '100%', sm: 'auto' },
              background: 'linear-gradient(135deg, #f59e0b 0%, #e8a020 100%)',
              color: '#000',
              fontWeight: 800,
              fontSize: '0.95rem',
              px: { xs: 0, sm: 4 },
              py: 1.5,
              borderRadius: 2.5,
              textTransform: 'none',
              boxShadow: '0 4px 20px rgba(232,160,32,0.3)',
              minHeight: 48,
              '&:hover': {
                background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                boxShadow: '0 8px 32px rgba(232,160,32,0.45)',
                transform: 'translateY(-2px)',
              },
              transition: 'all 0.25s ease',
            }}
          >
            Register for Free →
          </Button>

          <Button
            component={Link}
            href="/ask-seniors#colleges"
            variant="outlined"
            size="large"
            fullWidth={false}
            sx={{
              width: { xs: '100%', sm: 'auto' },
              borderColor: 'rgba(232,160,32,0.35)',
              color: '#e8a020',
              fontWeight: 600,
              fontSize: '0.95rem',
              px: { xs: 0, sm: 3.5 },
              py: 1.5,
              borderRadius: 2.5,
              textTransform: 'none',
              minHeight: 48,
              '&:hover': {
                borderColor: '#e8a020',
                bgcolor: 'rgba(232,160,32,0.07)',
                transform: 'translateY(-2px)',
              },
              transition: 'all 0.25s ease',
            }}
          >
            See All Colleges
          </Button>
        </Box>

        {/* Bottom free note */}
        <Box
          sx={{
            mt: 2.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.75,
          }}
        >
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: '#22c55e',
              '@keyframes softPulse': {
                '0%, 100%': { opacity: 1 },
                '50%': { opacity: 0.35 },
              },
              animation: 'softPulse 2.5s ease-in-out infinite',
            }}
          />
          <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem' }}>
            No payment. No signup required.
          </Typography>
        </Box>

      </Box>
    </Box>
  );
}
