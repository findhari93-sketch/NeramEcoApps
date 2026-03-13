'use client';

import { Box, Typography } from '@neram/ui';

/**
 * HeroBottomStrip — "SCROLL TO EXPLORE" + URL branding at bottom of hero
 */
export default function HeroBottomStrip() {
  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        px: { xs: 3, md: 8 },
        py: { xs: 1.5, md: 2.5 },
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        bgcolor: 'rgba(6,13,31,0.6)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Left: scroll indicator */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          opacity: 0,
          animation: 'neramFadeUp 1s ease forwards',
          animationDelay: '1.4s',
          transform: 'translateY(16px)',
        }}
      >
        <Box sx={{ width: { xs: 24, md: 40 }, height: '1px', bgcolor: 'rgba(255,255,255,0.15)' }} />
        <Typography
          sx={{
            fontFamily: '"SFMono-Regular", "Cascadia Code", "Consolas", monospace',
            fontSize: { xs: '9px', md: '11px' },
            color: 'text.secondary',
            letterSpacing: '0.1em',
          }}
        >
          SCROLL TO EXPLORE
        </Typography>
      </Box>

      {/* Right: URL branding (hidden on mobile) */}
      <Typography
        sx={{
          display: { xs: 'none', sm: 'block' },
          fontFamily: '"SFMono-Regular", "Cascadia Code", "Consolas", monospace',
          fontSize: '11px',
          color: 'text.secondary',
          letterSpacing: '0.08em',
          opacity: 0,
          animation: 'neramFadeUp 1s ease forwards',
          animationDelay: '1.5s',
          transform: 'translateY(16px)',
          '& span': { color: 'primary.main' },
        }}
      >
        <span>neramclasses.com</span> &middot; NATA &middot; JEE Paper 2 &middot; B.Arch
      </Typography>
    </Box>
  );
}
