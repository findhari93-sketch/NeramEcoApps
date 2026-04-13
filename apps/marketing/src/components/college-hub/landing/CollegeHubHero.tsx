import { Box, Container, Typography, Button, Stack, Paper } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import SchoolIcon from '@mui/icons-material/School';
import PublicIcon from '@mui/icons-material/Public';
import VerifiedIcon from '@mui/icons-material/Verified';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import { Link } from '@/i18n/routing';

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
        bgcolor: '#f8fafc',
        borderBottom: '1px solid',
        borderColor: 'divider',
        // Subtle grid pattern
        backgroundImage: `
          linear-gradient(rgba(148, 163, 184, 0.06) 1px, transparent 1px),
          linear-gradient(90deg, rgba(148, 163, 184, 0.06) 1px, transparent 1px)
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
                bgcolor: '#ede9fe',
                color: '#6d28d9',
                px: 1.5,
                py: 0.5,
                borderRadius: '20px',
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
                color: '#0f172a',
                mb: 2,
              }}
            >
              India&apos;s First Architecture
              <br />
              <Box
                component="span"
                sx={{
                  background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                College Discovery Platform
              </Box>
            </Typography>

            <Typography
              variant="body1"
              sx={{
                color: '#475569',
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
                  borderRadius: '10px',
                  textTransform: 'none',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  px: 3,
                  py: 1.25,
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
                  '&:hover': { boxShadow: '0 6px 20px rgba(37, 99, 235, 0.4)' },
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
                  borderRadius: '10px',
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  px: 3,
                  py: 1.25,
                  borderColor: '#cbd5e1',
                  color: '#334155',
                  '&:hover': { borderColor: '#94a3b8', bgcolor: 'rgba(0,0,0,0.02)' },
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
                    color: '#64748b',
                  }}
                >
                  <Box sx={{ color: '#2563eb', display: 'flex' }}>{item.icon}</Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#334155', fontSize: '0.8rem' }}>
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
                bgcolor: '#eef2ff',
                border: '2px dashed #c7d2fe',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
              }}
            >
              <SchoolIcon sx={{ fontSize: 64, color: '#818cf8' }} />
              <Typography variant="h6" sx={{ color: '#4f46e5', fontWeight: 700, fontSize: '1rem' }}>
                {stats.totalColleges} Colleges
              </Typography>
              <Typography variant="caption" sx={{ color: '#6366f1' }}>
                Architecture &amp; Design
              </Typography>
            </Paper>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
