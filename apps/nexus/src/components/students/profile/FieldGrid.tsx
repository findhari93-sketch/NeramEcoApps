'use client';

/**
 * Label-and-value pairs, the workhorse of the profile page.
 *
 * ONE COLUMN AT `xs`, AND THAT IS NOT NEGOTIABLE. A two-column grid at 375px
 * gives each cell about 160px, which cannot hold "Government-aided school" or a
 * street address without wrapping into an unreadable ladder. Labels sit above
 * values at every size, so a long value never squeezes its label.
 *
 * Values render at 16px. Anything smaller triggers iOS auto-zoom on focus and
 * reads badly on a phone held at arm's length.
 */

import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import { NOT_RECORDED } from '@/lib/student-profile-fields';

export interface FieldProps {
  label: string;
  /** A string, or a node when the value needs a chip or a link. */
  value?: ReactNode;
  /** Small explanatory line under the value, e.g. where the data came from. */
  hint?: string | null;
  /** Let a long value span the whole grid, e.g. an address or notes. */
  full?: boolean;
}

export function Field({ label, value, hint, full }: FieldProps) {
  const isEmpty =
    value === null || value === undefined || value === '' || value === NOT_RECORDED;

  return (
    <Box sx={{ minWidth: 0, gridColumn: full ? '1 / -1' : undefined }}>
      <Typography
        variant="caption"
        component="dt"
        sx={{
          display: 'block',
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: 'text.secondary',
          lineHeight: 1.4,
        }}
      >
        {label}
      </Typography>
      <Typography
        component="dd"
        sx={{
          m: 0,
          fontSize: '1rem',
          lineHeight: 1.5,
          // A missing value is muted, never hidden. "Nobody filled this in" is
          // information a teacher can act on; a vanished row is not.
          color: isEmpty ? 'text.disabled' : 'text.primary',
          wordBreak: 'break-word',
        }}
      >
        {isEmpty ? NOT_RECORDED : value}
      </Typography>
      {hint && (
        <Typography
          variant="caption"
          sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }}
        >
          {hint}
        </Typography>
      )}
    </Box>
  );
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        display: 'grid',
        gap: 2,
        gridTemplateColumns: {
          xs: '1fr',
          sm: 'repeat(2, minmax(0, 1fr))',
          lg: 'repeat(3, minmax(0, 1fr))',
        },
      }}
    >
      {children}
    </Box>
  );
}

/**
 * The sentence shown where a whole section has nothing in it.
 * Never a grid of dashes: see the header of lib/student-profile-fields.ts.
 */
export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
      {children}
    </Typography>
  );
}
