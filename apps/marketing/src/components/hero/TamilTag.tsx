'use client';

import { Typography } from '@neram/ui';

/**
 * TamilTag — bilingual identity label
 */
export default function TamilTag() {
  return (
    <Typography
      sx={{
        fontFamily: '"DM Sans", sans-serif',
        fontSize: { xs: '9px', md: '11px' },
        fontWeight: 400,
        color: 'text.secondary',
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        mb: { xs: 1, md: 1.5 },
        opacity: 0,
        transform: 'translateY(16px)',
        animation: 'neramFadeUp 0.8s ease forwards',
        animationDelay: '0.3s',
      }}
    >
      நேரம் கிளாஸஸ் &middot; Neram = Time &middot; Est. 2009
    </Typography>
  );
}
