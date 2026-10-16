'use client';

import { Box, Container, Typography, Paper, Chip, Stack } from '@mui/material';
import LeaderboardIcon from '@mui/icons-material/Leaderboard';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import RateReviewIcon from '@mui/icons-material/RateReview';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { Link } from '@/i18n/routing';
import { tokens } from '@/design-system';

const FEATURES = [
  {
    icon: <LeaderboardIcon />,
    title: 'Rankings',
    description: 'NIRF and ArchIndex rankings for B.Arch colleges',
    href: '/colleges/rankings/nirf',
    color: tokens.gold500,
    bg: tokens.navy900,
  },
  {
    icon: <CompareArrowsIcon />,
    title: 'Compare',
    description: 'Side-by-side comparison of up to 3 colleges',
    href: '/colleges/compare',
    color: tokens.gold500,
    bg: tokens.navy900,
  },
  {
    icon: <TrendingUpIcon />,
    title: 'Cutoff Data',
    description: 'TNEA and JoSAA cutoff trends across years',
    href: '/colleges/tnea',
    color: tokens.gold500,
    bg: tokens.navy900,
  },
  {
    icon: <AccountBalanceWalletIcon />,
    title: 'Fee Explorer',
    description: 'Filter colleges by annual fee range',
    href: '/colleges/fees/below-2-lakhs',
    color: tokens.gold500,
    bg: tokens.navy900,
  },
  {
    icon: <RateReviewIcon />,
    title: 'Student Reviews',
    description: 'Read verified reviews from architecture students',
    href: null,
    color: tokens.inkMuted,
    bg: tokens.surfaceHover,
    comingSoon: true,
  },
  {
    icon: <SmartToyIcon />,
    title: 'AI College Chat',
    description: 'Ask anything about a college, get instant answers',
    href: null,
    color: tokens.inkMuted,
    bg: tokens.surfaceHover,
    comingSoon: true,
  },
];

export default function PlatformFeatures() {
  return (
    <Box sx={{ py: { xs: 5, sm: 6, md: 8 } }}>
      <Container maxWidth="lg">
        {/* Section header */}
        <Box sx={{ textAlign: 'center', mb: { xs: 3, sm: 5 } }}>
          <Typography
            variant="h2"
            sx={{
              fontSize: { xs: '1.35rem', sm: '1.75rem' },
              fontWeight: 800,
              color: tokens.ink,
              mb: 1,
            }}
          >
            Everything you need to choose the right college
          </Typography>
          <Typography
            variant="body1"
            sx={{ color: tokens.inkMuted, maxWidth: 540, mx: 'auto', fontSize: '0.95rem' }}
          >
            Research, compare, and decide with data, not guesswork
          </Typography>
        </Box>

        {/* Feature grid */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
            gap: { xs: 2, sm: 2.5 },
          }}
        >
          {FEATURES.map((feature) => {
            const content = (
              <Paper
                variant="outlined"
                sx={{
                  p: { xs: 2.5, sm: 3 },
                  borderRadius: 1,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                  position: 'relative',
                  cursor: feature.href ? 'pointer' : 'default',
                  opacity: feature.comingSoon ? 0.65 : 1,
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  '&:hover': feature.href
                    ? { borderColor: tokens.gold500 }
                    : {},
                }}
              >
                {/* Icon */}
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: 1,
                    bgcolor: feature.bg,
                    color: feature.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {feature.icon}
                </Box>

                <Stack direction="row" alignItems="center" gap={1}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, color: tokens.ink }}>
                    {feature.title}
                  </Typography>
                  {feature.comingSoon && (
                    <Chip
                      label="Coming Soon"
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        bgcolor: tokens.surfaceHover,
                        color: tokens.inkMuted,
                      }}
                    />
                  )}
                </Stack>

                <Typography variant="body2" sx={{ color: tokens.inkMuted, lineHeight: 1.55 }}>
                  {feature.description}
                </Typography>
              </Paper>
            );

            if (feature.href) {
              return (
                <Link
                  key={feature.title}
                  href={feature.href as any}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  {content}
                </Link>
              );
            }
            return <Box key={feature.title}>{content}</Box>;
          })}
        </Box>
      </Container>
    </Box>
  );
}
