'use client';

import Image from 'next/image';
import { Box, Typography } from '@neram/ui';

interface BrandMarkProps {
  size?: 'sm' | 'md';
  /** Show "From Cutoffs to Colleges" under the wordmark */
  tagline?: boolean;
  /** Logo only, for the collapsed sidebar */
  iconOnly?: boolean;
}

/** The aiArchitek logo and wordmark. Gold #c47d10 on white is 3.3:1, AA for large bold text. */
export default function BrandMark({ size = 'md', tagline = false, iconOnly = false }: BrandMarkProps) {
  const logo = size === 'sm' ? 28 : 32;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <Image
        src="/aiArchitect_logo.svg"
        alt=""
        width={logo}
        height={logo}
        priority
        style={{ borderRadius: '50%', flexShrink: 0 }}
      />
      {!iconOnly && (
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="span"
            sx={{
              display: 'block',
              // Bold and at least 19px, so the brand gold below counts as large text (3:1)
              fontSize: size === 'sm' ? '1.1875rem' : '1.3125rem',
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: 'text.primary',
              lineHeight: 1.1,
            }}
          >
            ai
            <Box
              component="span"
              sx={{ color: (theme) => (theme.palette.mode === 'light' ? '#c47d10' : '#f4bf5a') }}
            >
              Architek
            </Box>
          </Typography>
          {tagline && (
            <Typography
              component="span"
              sx={{ display: 'block', fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.3, mt: 0.25 }}
            >
              From Cutoffs to Colleges
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
