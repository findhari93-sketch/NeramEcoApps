'use client';

import { Box, Typography } from '@neram/ui';
import { tokens as t } from '@/design-system';

/** A thin rule with a small mono label in the middle, "or type it yourself". */
export default function OrDivider({ label }: { label: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }} role="separator" aria-label={label}>
      <Box sx={{ flex: 1, height: '1px', bgcolor: t.line }} />
      <Typography
        component="span"
        aria-hidden
        sx={{
          fontFamily: t.fontMono,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: t.inkMuted,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
      <Box sx={{ flex: 1, height: '1px', bgcolor: t.line }} />
    </Box>
  );
}
