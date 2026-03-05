'use client';

import { Box } from '@neram/ui';

/**
 * SectionDivider — Architectural gold line with diamond accent.
 * Used between homepage sections for visual rhythm.
 */
export default function SectionDivider() {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        py: 1,
      }}
    >
      {/* Left line */}
      <Box
        sx={{
          width: 56,
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(232,160,32,0.3))',
        }}
      />
      {/* Diamond */}
      <Box
        sx={{
          width: 6,
          height: 6,
          bgcolor: '#e8a020',
          transform: 'rotate(45deg)',
          mx: 1.5,
          opacity: 0.6,
        }}
      />
      {/* Right line */}
      <Box
        sx={{
          width: 56,
          height: '1px',
          background: 'linear-gradient(90deg, rgba(232,160,32,0.3), transparent)',
        }}
      />
    </Box>
  );
}
