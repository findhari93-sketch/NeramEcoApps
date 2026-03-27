'use client';

import { Box, Typography } from '@neram/ui';
import { neramFontFamilies } from '@neram/ui';

const flickerKeyframes = `
@keyframes flicker {
  0%, 100% { opacity: 1; transform: scaleY(1); }
  25% { opacity: 0.85; transform: scaleY(0.97); }
  50% { opacity: 0.95; transform: scaleY(1.02); }
  75% { opacity: 0.9; transform: scaleY(0.98); }
}
`;

interface StreakFlameProps {
  days: number;
  size?: 'small' | 'medium';
}

export default function StreakFlame({ days, size = 'medium' }: StreakFlameProps) {
  if (days <= 0) return null;

  const isSmall = size === 'small';
  const iconSize = isSmall ? 18 : 26;
  const fontSize = isSmall ? '0.75rem' : '0.875rem';

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isSmall ? 0.25 : 0.5,
      }}
    >
      {/* Inject keyframes */}
      <style>{flickerKeyframes}</style>

      {/* Flame SVG */}
      <Box
        component="svg"
        viewBox="0 0 24 32"
        sx={{
          width: iconSize,
          height: iconSize,
          animation: 'flicker 1.5s ease-in-out infinite',
          transformOrigin: 'bottom center',
          '@media (prefers-reduced-motion: reduce)': {
            animation: 'none',
          },
        }}
      >
        <defs>
          <linearGradient id={`flame-grad-${size}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#ff4500" />
            <stop offset="40%" stopColor="#ff6b00" />
            <stop offset="70%" stopColor="#ff8c00" />
            <stop offset="100%" stopColor="#ffd700" />
          </linearGradient>
        </defs>
        <path
          d="M12 2C12 2 4 12 4 20C4 24.4 7.6 28 12 28C16.4 28 20 24.4 20 20C20 12 12 2 12 2ZM12 25C9.2 25 7 22.8 7 20C7 16 12 8 12 8C12 8 17 16 17 20C17 22.8 14.8 25 12 25Z"
          fill={`url(#flame-grad-${size})`}
        />
        {/* Inner flame */}
        <path
          d="M12 12C12 12 9 17 9 20C9 21.7 10.3 23 12 23C13.7 23 15 21.7 15 20C15 17 12 12 12 12Z"
          fill="#ffd700"
          opacity={0.8}
        />
      </Box>

      {/* Day count */}
      <Typography
        component="span"
        sx={{
          fontFamily: neramFontFamilies.mono,
          fontSize,
          fontWeight: 700,
          color: '#ff8c00',
          lineHeight: 1,
        }}
      >
        {days}
      </Typography>
    </Box>
  );
}
