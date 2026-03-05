'use client';

import { Box, Typography } from '@neram/ui';

/**
 * MicrosoftBadge — "Supported by Microsoft Education" with 4-color logo
 */
export default function MicrosoftBadge() {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        mt: { xs: 1.5, md: 2 },
        opacity: 0,
        transform: 'translateY(12px)',
        animation: 'neramFadeUp 0.9s ease forwards',
        animationDelay: '1.15s',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          bgcolor: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '100px',
          py: { xs: 0.5, md: 0.75 },
          pl: { xs: 1, md: 1.25 },
          pr: { xs: 1.25, md: 1.75 },
        }}
      >
        {/* 4-color Microsoft logo */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '2px',
            width: { xs: 12, md: 16 },
            height: { xs: 12, md: 16 },
          }}
        >
          <Box sx={{ bgcolor: '#f25022', borderRadius: '1px' }} />
          <Box sx={{ bgcolor: '#7fba00', borderRadius: '1px' }} />
          <Box sx={{ bgcolor: '#00a4ef', borderRadius: '1px' }} />
          <Box sx={{ bgcolor: '#ffb900', borderRadius: '1px' }} />
        </Box>

        <Typography
          component="span"
          sx={{
            fontFamily: '"DM Sans", sans-serif',
            fontSize: { xs: '9px', md: '11px' },
            fontWeight: 400,
            color: 'text.secondary',
            letterSpacing: '0.04em',
            '& strong': {
              color: 'rgba(255,255,255,0.7)',
              fontWeight: 500,
            },
          }}
        >
          Supported by <strong>Microsoft Education</strong>
        </Typography>
      </Box>
    </Box>
  );
}
