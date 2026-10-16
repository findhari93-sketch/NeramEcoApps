'use client';

import { Box, Container, Typography, Button, Stack } from '@mui/material';
import VerifiedIcon from '@mui/icons-material/Verified';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import BarChartIcon from '@mui/icons-material/BarChart';
import View360Icon from '@mui/icons-material/ViewInAr';
import SchoolIcon from '@mui/icons-material/School';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PeopleIcon from '@mui/icons-material/People';
import { Link } from '@/i18n/routing';
import { tokens } from '@/design-system';

const BENEFITS = [
  { icon: <VerifiedIcon sx={{ fontSize: 20 }} />, text: 'Verified badge on your college profile' },
  { icon: <NotificationsActiveIcon sx={{ fontSize: 20 }} />, text: 'Get student inquiry leads directly' },
  { icon: <BarChartIcon sx={{ fontSize: 20 }} />, text: 'Track profile views and engagement analytics' },
  { icon: <View360Icon sx={{ fontSize: 20 }} />, text: '360° virtual campus tour hosting' },
];

const STATS = [
  { icon: <SchoolIcon sx={{ fontSize: 22 }} />, value: '200+', label: 'Colleges Listed' },
  { icon: <PeopleIcon sx={{ fontSize: 22 }} />, value: '50K+', label: 'Monthly Students' },
  { icon: <TrendingUpIcon sx={{ fontSize: 22 }} />, value: '3x', label: 'More Applications' },
];

export default function ForCollegesCTA() {
  return (
    <Box
      sx={{
        background: tokens.navy900,
        py: { xs: 5, sm: 6, md: 7 },
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle background pattern */}
      <Box
        sx={{
          position: 'absolute', inset: 0, opacity: 0.05,
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { xs: 'flex-start', md: 'center' },
            gap: { xs: 4, md: 6 },
          }}
        >
          {/* Left: Text content */}
          <Box sx={{ flex: 1 }}>
            {/* Eyebrow */}
            <Box
              sx={{
                display: 'inline-flex', alignItems: 'center', gap: 0.75,
                bgcolor: tokens.goldTintBg, borderRadius: `${tokens.radiusPill}px`, px: 1.5, py: 0.5, mb: 2,
              }}
            >
              <VerifiedIcon sx={{ fontSize: 16, color: tokens.gold500 }} />
              <Typography sx={{ fontSize: '0.75rem', color: tokens.gold300, fontWeight: 600, letterSpacing: 0.5 }}>
                FOR COLLEGES AND INSTITUTIONS
              </Typography>
            </Box>

            <Typography
              variant="h3"
              sx={{
                fontSize: { xs: '1.4rem', sm: '1.85rem' },
                fontWeight: 800,
                color: tokens.paper,
                mb: 1.5,
                lineHeight: 1.25,
              }}
            >
              Reach thousands of aspiring architects.
              <br />
              <Box component="span" sx={{ color: tokens.gold500 }}>Partner with Neram.</Box>
            </Typography>
            <Typography
              variant="body1"
              sx={{ color: tokens.paperMuted, mb: 3, maxWidth: 500, lineHeight: 1.7 }}
            >
              Claim your college profile, share verified data, and connect
              directly with students exploring B.Arch admissions across India.
            </Typography>

            {/* Benefits grid */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 1.5,
                mb: 3.5,
              }}
            >
              {BENEFITS.map((b) => (
                <Box
                  key={b.text}
                  sx={{
                    display: 'flex', alignItems: 'flex-start', gap: 1.25,
                    bgcolor: tokens.navy800, borderRadius: 1, p: 1.5,
                  }}
                >
                  <Box sx={{ color: tokens.gold500, display: 'flex', mt: 0.15 }}>{b.icon}</Box>
                  <Typography variant="body2" sx={{ color: tokens.paper, fontWeight: 500, fontSize: '0.85rem', lineHeight: 1.45 }}>
                    {b.text}
                  </Typography>
                </Box>
              ))}
            </Box>

            {/* CTA row */}
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
              <Button
                component={Link}
                href="/contact"
                variant="contained"
                size="large"
                sx={{
                  bgcolor: tokens.gold500,
                  color: tokens.navy900,
                  borderRadius: 1,
                  textTransform: 'none',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  px: 4,
                  py: 1.5,
                  minHeight: 48,
                  boxShadow: 'none',
                  '&:hover': { bgcolor: tokens.gold300, color: tokens.navy900, boxShadow: 'none' },
                }}
              >
                Claim Your College Profile
              </Button>
              <Button
                component={Link}
                href="/colleges"
                variant="text"
                sx={{
                  color: tokens.paperMuted,
                  textTransform: 'none',
                  fontWeight: 500,
                  fontSize: '0.85rem',
                  minHeight: 48,
                  '&:hover': { color: tokens.gold500, bgcolor: tokens.lineDark },
                }}
              >
                Learn about partnership tiers →
              </Button>
            </Stack>
          </Box>

          {/* Right: Stats cards (replaces the empty dashed circle) */}
          <Box
            sx={{
              display: 'flex',
              flex: { md: '0 0 300px' },
              flexDirection: 'column',
              gap: 2,
              width: { xs: '100%', md: 'auto' },
            }}
          >
            {STATS.map((stat) => (
              <Box
                key={stat.label}
                sx={{
                  bgcolor: tokens.navy800,
                  backdropFilter: 'blur(8px)',
                  border: `1px solid ${tokens.lineDark}`,
                  borderRadius: 1,
                  p: 2.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  transition: 'all 0.2s',
                  '&:hover': { borderColor: tokens.gold500, transform: 'translateX(-4px)' },
                }}
              >
                <Box
                  sx={{
                    width: 48, height: 48, borderRadius: 1,
                    bgcolor: tokens.navy900,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: tokens.gold500, flexShrink: 0,
                  }}
                >
                  {stat.icon}
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, color: tokens.gold500, lineHeight: 1.1 }}>
                    {stat.value}
                  </Typography>
                  <Typography sx={{ fontSize: '0.8rem', color: tokens.paperSubtle, fontWeight: 500 }}>
                    {stat.label}
                  </Typography>
                </Box>
              </Box>
            ))}

            {/* Social proof line */}
            <Box
              sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                px: 1, mt: 0.5,
              }}
            >
              {/* Avatar stack */}
              <Box sx={{ display: 'flex' }}>
                {['M', 'A', 'C', 'S'].map((initial, i) => (
                  <Box
                    key={initial}
                    sx={{
                      width: 28, height: 28, borderRadius: '50%',
                      bgcolor: tokens.navy700, border: `2px solid ${tokens.navy900}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      ml: i > 0 ? -1 : 0, zIndex: 4 - i,
                    }}
                  >
                    <Typography sx={{ fontSize: '0.6rem', color: tokens.paper, fontWeight: 700 }}>
                      {initial}
                    </Typography>
                  </Box>
                ))}
              </Box>
              <Typography sx={{ fontSize: '0.75rem', color: tokens.paperSubtle, lineHeight: 1.3 }}>
                Measi, CAAD, SPA and 40+ colleges already on Neram
              </Typography>
            </Box>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
