'use client';

import { Box, Typography } from '@neram/ui';

/** A thin rule with a small mono label in the middle, "or type it yourself". */
export default function OrDivider({ label }: { label: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }} role="separator" aria-label={label}>
      <Box sx={{ flex: 1, height: '1px', bgcolor: '#d9d6cf' }} />
      <Typography
        component="span"
        aria-hidden
        sx={{
          fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'text.secondary',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
      <Box sx={{ flex: 1, height: '1px', bgcolor: '#d9d6cf' }} />
    </Box>
  );
}
