'use client';

import { Box, Typography } from '@neram/ui';

interface RankItem {
  value: string;
  label: string;
}

const rankItems: RankItem[] = [
  { value: 'AIR 1&2', label: 'JEE b.arch · 2024 & 25' },
  { value: 'AIR 1&2', label: 'NATA · 2024&25' },
  { value: '189', label: 'NATA Score' },
  { value: '10+', label: 'Years' },
];

/**
 * RankBar — horizontal stat strip showing key achievements
 * Mobile: 2×2 grid | Desktop: single row
 */
export default function RankBar() {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, auto)' },
        mb: { xs: 2, md: 3 },
        opacity: 0,
        transform: 'translateY(16px)',
        animation: 'neramFadeUp 0.9s ease forwards',
        animationDelay: '0.8s',
        width: 'fit-content',
        maxWidth: '100%',
      }}
    >
      {rankItems.map((item, i) => (
        <Box
          key={i}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            px: { xs: 1.5, md: 2.5 },
            py: { xs: 1, md: 1.75 },
            border: '1px solid rgba(255,255,255,0.07)',
            bgcolor: 'rgba(255,255,255,0.025)',
            backdropFilter: 'blur(8px)',
            // Desktop: rounded corners on first/last only
            // Mobile: rounded corners on grid corners
            borderRadius: {
              xs: i === 0 ? '6px 0 0 0' : i === 1 ? '0 6px 0 0' : i === 2 ? '0 0 0 6px' : '0 0 6px 0',
              md: i === 0 ? '6px 0 0 6px' : i === rankItems.length - 1 ? '0 6px 6px 0' : 0,
            },
            // Collapse borders
            mt: { xs: i >= 2 ? '-1px' : 0, md: 0 },
            ml: { xs: i % 2 === 1 ? '-1px' : 0, md: i > 0 ? '-1px' : 0 },
          }}
        >
          <Typography
            sx={{
              fontFamily: '"Space Mono", monospace',
              fontSize: { xs: '16px', md: '22px' },
              fontWeight: 700,
              color: 'primary.main',
              lineHeight: 1,
            }}
          >
            {item.value}
          </Typography>
          <Typography
            sx={{
              fontFamily: '"DM Sans", sans-serif',
              fontSize: { xs: '8px', md: '10px' },
              fontWeight: 400,
              color: 'text.secondary',
              mt: 0.5,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            {item.label}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
