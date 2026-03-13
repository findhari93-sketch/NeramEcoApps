'use client';

import { Box, Typography } from '@neram/ui';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3011';

/**
 * aiArchitekPill — "Introducing aiArchitek · Free" badge (top-right of hero)
 */
export default function aiArchitekPill() {
  return (
    <Box
      component="a"
      href={`${APP_URL}/tools`}
      target="_blank"
      rel="noopener noreferrer"
      sx={{
        position: 'absolute',
        top: '8%',
        right: '2%',
        zIndex: 20,
        display: { xs: 'none', lg: 'flex' },
        alignItems: 'center',
        gap: 1,
        textDecoration: 'none',
        cursor: 'pointer',
        background: 'linear-gradient(135deg, rgba(26,143,255,0.15), rgba(232,160,32,0.1))',
        border: '1px solid rgba(26,143,255,0.35)',
        borderRadius: '100px',
        py: 1,
        pl: 1.5,
        pr: 2.25,
        opacity: 0,
        animation: 'neramFadeUp 1s ease forwards',
        animationDelay: '1.2s',
        transform: 'translateY(16px)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        '&:hover': {
          transform: 'translateY(16px) scale(1.03)',
          boxShadow: '0 8px 30px rgba(26,143,255,0.2)',
        },
      }}
    >
      {/* Pulsing dot */}
      <Box
        sx={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          bgcolor: 'secondary.light',
          animation: 'neramPulse 1.5s ease-in-out infinite',
        }}
      />
      <Typography
        sx={{
          fontFamily: '"SFMono-Regular", "Cascadia Code", "Consolas", monospace',
          fontSize: '11px',
          fontWeight: 700,
          color: 'secondary.light',
          letterSpacing: '0.08em',
        }}
      >
        Introducing aiArchitek ✦ Free
      </Typography>
    </Box>
  );
}
