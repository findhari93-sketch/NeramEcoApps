'use client';

import { Box, LinearProgress } from '@neram/ui';
import BrandMark from './BrandMark';

/** Shown while sign-in is checked. Brand first, then a quiet progress line. */
export default function AppSplash({ label = 'Loading aiArchitek' }: { label?: string }) {
  return (
    <Box
      role="status"
      aria-live="polite"
      aria-busy="true"
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2.5,
        bgcolor: 'background.default',
      }}
    >
      <BrandMark tagline />
      <LinearProgress sx={{ width: 160, height: 3 }} aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </Box>
  );
}
