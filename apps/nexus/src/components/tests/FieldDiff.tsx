'use client';

import { Box, Typography } from '@neram/ui';

/**
 * A changed value, the old one struck through above the new.
 *
 * Used where a teacher decides whether to accept a change (the AI review step)
 * and where they look back at one (a question's "What changed"). The old line
 * carries a hidden "Was" and the new a hidden "Now", so the change still reads
 * to a screen reader and to anyone who cannot tell the two colours apart.
 */

const srOnly = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

export default function FieldDiff({
  label,
  before,
  after,
}: {
  label?: string;
  before: string | null;
  after: string | null;
}) {
  return (
    <Box sx={{ mb: 1.25 }}>
      {label && (
        <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, mb: 0.25 }}>
          {label}
        </Typography>
      )}
      <Typography
        variant="body2"
        sx={{ textDecoration: 'line-through', color: 'text.secondary', wordBreak: 'break-word' }}
      >
        <Box component="span" sx={srOnly}>
          Was:{' '}
        </Box>
        {before || '(empty)'}
      </Typography>
      <Typography variant="body2" sx={{ color: 'success.dark', fontWeight: 600, wordBreak: 'break-word' }}>
        <Box component="span" sx={srOnly}>
          Now:{' '}
        </Box>
        {after || '(empty)'}
      </Typography>
    </Box>
  );
}
