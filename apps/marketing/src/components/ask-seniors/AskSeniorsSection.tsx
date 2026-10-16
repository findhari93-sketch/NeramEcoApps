'use client';

import Link from 'next/link';
import { Box, Typography, Button } from '@neram/ui';
import type { AskSeniorsEvent, AskSeniorsCollege } from '@neram/database';
import { tokens } from '@/design-system';
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
        // Navy band with the blueprint grid, ruled top and bottom
        bgcolor: tokens.navy900,
        ...tokens.blueprint,
        borderTop: `1px solid ${tokens.lineDark}`,
        borderBottom: `1px solid ${tokens.lineDark}`,
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
            borderRadius: `${tokens.radiusPill}px`,
            bgcolor: tokens.goldTintBg,
            border: `1px solid ${tokens.goldTintBorder}`,
          }}
        >
          <Box
            sx={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              bgcolor: tokens.statusDone,
            }}
          />
          <Typography
            sx={{
              color: tokens.gold300,
              fontFamily: tokens.fontMono,
              fontSize: '0.75rem',
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
            color: tokens.gold500,
            letterSpacing: '-0.5px',
          }}
        >
          #AskSeniors
        </Typography>

        {/* Tagline */}
        <Typography
          sx={{
            color: tokens.paperMuted,
            maxWidth: 420,
            mx: 'auto',
            lineHeight: 1.65,
            fontSize: { xs: '0.95rem', md: '1rem' },
            mb: 4,
            px: { xs: 2.5, md: 0 },
          }}
        >
          Current B.Arch students from{' '}
          <Box component="strong" sx={{ color: tokens.paper, fontWeight: 600 }}>
            Tamil Nadu&apos;s top colleges
          </Box>{' '}
          answer your questions. Before TNEA counselling.
        </Typography>

        {/* Stats row: small cards */}
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
                borderRadius: `${tokens.radius}px`,
                bgcolor: tokens.navy800,
                border: `1px solid ${tokens.lineDark}`,
                minWidth: 90,
              }}
            >
              <Typography
                sx={{
                  color: tokens.gold500,
                  fontSize: { xs: '1.35rem', md: '1.5rem' },
                  fontWeight: 900,
                  lineHeight: 1.1,
                }}
              >
                {value}
              </Typography>
              <Typography
                sx={{
                  color: tokens.paperSubtle,
                  fontSize: '0.75rem',
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
              bgcolor: tokens.gold500,
              color: tokens.navy900,
              fontWeight: 800,
              fontSize: '0.95rem',
              px: { xs: 0, sm: 4 },
              py: 1.5,
              borderRadius: `${tokens.radius}px`,
              textTransform: 'none',
              boxShadow: 'none',
              minHeight: 48,
              '&:hover': { bgcolor: tokens.gold300, boxShadow: 'none' },
              transition: 'background-color 150ms ease',
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
              borderColor: tokens.outlineDark,
              color: tokens.paper,
              fontWeight: 600,
              fontSize: '0.95rem',
              px: { xs: 0, sm: 3.5 },
              py: 1.5,
              borderRadius: `${tokens.radius}px`,
              textTransform: 'none',
              minHeight: 48,
              '&:hover': {
                borderColor: tokens.gold500,
                color: tokens.gold500,
                bgcolor: 'transparent',
              },
              transition: 'border-color 150ms ease, color 150ms ease',
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
              bgcolor: tokens.statusDone,
            }}
          />
          <Typography sx={{ color: tokens.paperSubtle, fontSize: '0.875rem' }}>
            No payment. No signup required.
          </Typography>
        </Box>

      </Box>
    </Box>
  );
}
