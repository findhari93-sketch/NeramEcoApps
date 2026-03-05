'use client';

import { Box, Typography } from '@neram/ui';
import { type SxProps, type Theme } from '@neram/ui';

interface FloatingToolBadgeProps {
  icon: string;
  label: string;
  /** Position preset: t1 (top-left), t2 (mid-right), t3 (bottom-left) */
  position: 't1' | 't2' | 't3';
  href?: string;
  sx?: SxProps<Theme>;
}

const positionStyles: Record<string, SxProps<Theme>> = {
  t1: {
    top: '20%',
    left: { xs: '-4%', md: '-10%' },
    animation: 'neramFloatA 6s ease-in-out infinite',
  },
  t2: {
    top: '38%',
    right: { xs: '-4%', md: '-8%' },
    animation: 'neramFloatB 7s ease-in-out infinite',
    animationDelay: '-2s',
  },
  t3: {
    bottom: '18%',
    left: { xs: '-2%', md: '-5%' },
    animation: 'neramFloatA 8s ease-in-out infinite',
    animationDelay: '-4s',
  },
};

/**
 * FloatingToolBadge — glass card that floats around the clock
 */
export default function FloatingToolBadge({ icon, label, position, href, sx }: FloatingToolBadgeProps) {
  return (
    <Box
      component={href ? 'a' : 'div'}
      {...(href ? { href, target: '_blank', rel: 'noopener noreferrer' } : {})}
      sx={{
        position: 'absolute',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        textDecoration: 'none',
        cursor: href ? 'pointer' : 'default',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        '&:hover': href ? { transform: 'scale(1.05)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' } : {},
        bgcolor: 'rgba(11,22,41,0.85)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: { xs: '8px', md: '10px' },
        px: { xs: 1.25, md: 2 },
        py: { xs: 0.75, md: 1.25 },
        fontFamily: '"DM Sans", sans-serif',
        fontSize: { xs: '10px', md: '12px' },
        fontWeight: 500,
        color: 'text.primary',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        whiteSpace: 'nowrap',
        ...positionStyles[position],
        ...((sx as object) || {}),
      }}
    >
      <Box component="span" sx={{ fontSize: { xs: '14px', md: '18px' } }}>{icon}</Box>
      <Box>
        <Typography sx={{ fontSize: { xs: '9px', md: '11px' }, color: 'text.secondary', lineHeight: 1.2 }}>
          aiArchitek
        </Typography>
        <Typography sx={{ fontSize: { xs: '10px', md: '12px' }, fontWeight: 500, lineHeight: 1.3 }}>
          {label}
        </Typography>
      </Box>
    </Box>
  );
}
