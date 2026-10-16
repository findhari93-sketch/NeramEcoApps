'use client';

import { Box, Container, Typography, Button, Stack, Paper } from '@mui/material';
import { alpha } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import SchoolIcon from '@mui/icons-material/School';
import PublicIcon from '@mui/icons-material/Public';
import VerifiedIcon from '@mui/icons-material/Verified';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import { Link } from '@/i18n/routing';
import { tokens } from '@/design-system';

interface CollegeHubHeroProps {
  stats: {
    totalColleges: number;
    totalStates: number;
    coaApprovedCount: number;
  };
}

const STAT_ITEMS = [
  { icon: <SchoolIcon sx={{ fontSize: 20 }} />, getLabel: (s: CollegeHubHeroProps['stats']) => `${s.totalColleges} Colleges` },
  { icon: <PublicIcon sx={{ fontSize: 20 }} />, getLabel: (s: CollegeHubHeroProps['stats']) => s.totalStates === 1 ? 'Tamil Nadu' : `${s.totalStates} States` },
  { icon: <VerifiedIcon sx={{ fontSize: 20 }} />, getLabel: (s: CollegeHubHeroProps['stats']) => `${s.coaApprovedCount} COA Approved` },
  { icon: <LockOpenIcon sx={{ fontSize: 20 }} />, getLabel: () => '100% Free' },
];

export default function CollegeHubHero({ stats }: CollegeHubHeroProps) {
  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        bgcolor: tokens.ground,
        borderBottom: '1px solid',
        borderColor: tokens.line,
        // Subtle grid pattern
        backgroundImage: `
          linear-gradient(${alpha(tokens.ink, 0.04)} 1px, transparent 1px),
          linear-gradient(90deg, ${alpha(tokens.ink, 0.04)} 1px, transparent 1px)
        `,
        backgroundSize: '32px 32px',
      }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { xs: 'flex-start', md: 'center' },
            gap: { xs: 3, md: 6 },
            py: { xs: 5, sm: 6, md: 8 },
            minHeight: { md: 420 },
          }}
        >
          {/* Left: Text + CTAs */}
          <Box sx={{ flex: 1, maxWidth: { md: 600 } }}>
            {/* Overline */}
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                bgcolor: tokens.goldTintBg,
                color: tokens.gold800,
                px: 1.5,
                py: 0.5,
                borderRadius: `${tokens.radiusPill}px`,
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.02em',
                mb: 2,
              }}
            >
              <SchoolIcon sx={{ fontSize: 14 }} />
              Beta: {stats.totalColleges} Colleges and growing
            </Box>

            <Typography
              variant="h1"
              sx={{
                fontSize: { xs: '1.75rem', sm: '2.25rem', md: '2.75rem' },
                fontWeight: 800,
                lineHeight: 1.15,
                letterSpacing: '-0.02em',
                color: tokens.ink,
                mb: 2,
              }}
            >
              India&apos;s First Architecture
              <br />
              <Box
                component="span"
                sx={{ color: tokens.gold800 }}
              >
                College Discovery Platform
              </Box>
            </Typography>

            <Typography
              variant="body1"
              sx={{
                color: tokens.inkMuted,
                fontSize: { xs: '0.95rem', sm: '1.05rem' },
                lineHeight: 1.65,
                maxWidth: 520,
                mb: 3.5,
              }}
            >
              Compare fees, NATA cutoffs, NIRF rankings, placements, and infrastructure
              for B.Arch colleges across India. Free and open for every student.
            </Typography>

            {/* CTAs */}
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}>
              <Button
                component="a"
                href="#browse"
                variant="contained"
                size="large"
                startIcon={<SearchIcon />}
                sx={{
                  borderRadius: 1,
                  textTransform: 'none',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  px: 3,
                  py: 1.25,
                  boxShadow: 'none',
                  '&:hover': { boxShadow: 'none' },
                }}
              >
                Explore Colleges
              </Button>
              <Button
                component={Link}
                href="/colleges/compare"
                variant="outlined"
                size="large"
                startIcon={<CompareArrowsIcon />}
                sx={{
                  borderRadius: 1,
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  px: 3,
                  py: 1.25,
                  borderColor: tokens.lineStrong,
                  color: tokens.ink,
                  '&:hover': { borderColor: tokens.navy900, bgcolor: tokens.navy900, color: tokens.paper },
                }}
              >
                Compare Colleges
              </Button>
            </Stack>

            {/* Stat strip */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, auto)' },
                gap: { xs: 1.5, sm: 3 },
                mt: 4,
              }}
            >
              {STAT_ITEMS.map((item, i) => (
                <Box
                  key={i}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    color: tokens.inkMuted,
                  }}
                >
                  <Box sx={{ color: tokens.gold800, display: 'flex' }}>{item.icon}</Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: tokens.ink, fontSize: '0.8rem' }}>
                    {item.getLabel(stats)}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Right: Decorative illustration (desktop only) */}
          <Box
            sx={{
              display: { xs: 'none', md: 'flex' },
              flex: '0 0 340px',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Paper
              elevation={0}
              sx={{
                width: 300,
                height: 300,
                borderRadius: '50%',
                bgcolor: tokens.surface,
                border: `2px dashed ${tokens.lineStrong}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
              }}
            >
              <SchoolIcon sx={{ fontSize: 64, color: tokens.gold800 }} />
              <Typography variant="h6" sx={{ color: tokens.ink, fontWeight: 700, fontSize: '1rem' }}>
                {stats.totalColleges} Colleges
              </Typography>
              <Typography variant="caption" sx={{ color: tokens.inkMuted }}>
                Architecture &amp; Design
              </Typography>
            </Paper>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
