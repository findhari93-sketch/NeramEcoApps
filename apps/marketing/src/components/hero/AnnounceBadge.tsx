'use client';

import { Box, Typography } from '@neram/ui';

/**
 * AnnounceBadge — "NEW · India's First AI-Enabled NATA Learning Platform"
 */
export default function AnnounceBadge() {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        bgcolor: 'rgba(232,160,32,0.1)',
        border: '1px solid rgba(232,160,32,0.3)',
        borderRadius: '100px',
        py: { xs: 0.5, md: 0.75 },
        pl: 1,
        pr: { xs: 1.25, md: 1.75 },
        width: 'fit-content',
        mb: { xs: 1.5, md: 2 },
        opacity: 0,
        transform: 'translateY(16px)',
        animation: 'neramFadeUp 0.8s ease forwards',
        animationDelay: '0.2s',
      }}
    >
      <Box
        component="span"
        sx={{
          bgcolor: 'primary.main',
          color: 'background.default',
          fontFamily: '"SFMono-Regular", "Cascadia Code", "Consolas", monospace',
          fontSize: { xs: '8px', md: '9px' },
          fontWeight: 700,
          px: 0.875,
          py: 0.375,
          borderRadius: '100px',
          letterSpacing: '0.05em',
        }}
      >
        NEW
      </Box>
      <Typography
        component="span"
        sx={{
          fontFamily: '"Inter", sans-serif',
          fontSize: { xs: '10px', md: '12px' },
          fontWeight: 500,
          color: 'primary.light',
          letterSpacing: '0.03em',
        }}
      >
        India&apos;s First AI-Enabled NATA Learning Platform
      </Typography>
    </Box>
  );
}
