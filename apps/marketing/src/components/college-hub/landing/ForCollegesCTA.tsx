'use client';

import { Box, Container, Typography, Button, Stack } from '@mui/material';
import VerifiedIcon from '@mui/icons-material/Verified';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import BarChartIcon from '@mui/icons-material/BarChart';
import View360Icon from '@mui/icons-material/ViewInAr';
import { Link } from '@/i18n/routing';

const BENEFITS = [
  { icon: <VerifiedIcon sx={{ fontSize: 18 }} />, text: 'Verified college badge' },
  { icon: <NotificationsActiveIcon sx={{ fontSize: 18 }} />, text: 'Student lead notifications' },
  { icon: <BarChartIcon sx={{ fontSize: 18 }} />, text: 'Profile analytics dashboard' },
  { icon: <View360Icon sx={{ fontSize: 18 }} />, text: 'Virtual tour hosting' },
];

export default function ForCollegesCTA() {
  return (
    <Box
      sx={{
        background: 'linear-gradient(135deg, #4c1d95, #6d28d9, #7c3aed)',
        py: { xs: 5, sm: 6, md: 7 },
      }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { xs: 'flex-start', md: 'center' },
            gap: { xs: 3, md: 6 },
          }}
        >
          {/* Text */}
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="h3"
              sx={{
                fontSize: { xs: '1.35rem', sm: '1.75rem' },
                fontWeight: 800,
                color: '#fff',
                mb: 1.5,
              }}
            >
              Are you a college? Partner with Neram.
            </Typography>
            <Typography
              variant="body1"
              sx={{ color: 'rgba(255,255,255,0.8)', mb: 3, maxWidth: 480, lineHeight: 1.6 }}
            >
              Claim your college profile, share verified data, and connect with
              thousands of aspiring architecture students across India.
            </Typography>

            {/* Benefits */}
            <Stack gap={1.25} sx={{ mb: 3.5 }}>
              {BENEFITS.map((b) => (
                <Box key={b.text} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ color: '#c4b5fd', display: 'flex' }}>{b.icon}</Box>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>
                    {b.text}
                  </Typography>
                </Box>
              ))}
            </Stack>

            <Button
              component={Link}
              href="/contact"
              variant="contained"
              size="large"
              sx={{
                bgcolor: '#fff',
                color: '#6d28d9',
                borderRadius: '10px',
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.95rem',
                px: 3.5,
                py: 1.25,
                '&:hover': { bgcolor: '#f5f3ff', boxShadow: 3 },
              }}
            >
              Claim Your College Profile
            </Button>
          </Box>

          {/* Visual element */}
          <Box
            sx={{
              display: { xs: 'none', md: 'flex' },
              flex: '0 0 240px',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Box
              sx={{
                width: 180,
                height: 180,
                borderRadius: '50%',
                border: '3px dashed rgba(255,255,255,0.25)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.5,
              }}
            >
              <VerifiedIcon sx={{ fontSize: 48, color: '#c4b5fd' }} />
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                Neram Partner
              </Typography>
            </Box>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
