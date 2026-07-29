'use client';

import { Box, Typography, alpha } from '@neram/ui';

/** Thin labeled progress bar (attendance / checklist), clearer than a plain chip. */
export function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Box sx={{ minWidth: 92, flex: '0 1 130px' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.25 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', fontWeight: 600 }}>
          {label}
        </Typography>
        <Typography variant="caption" sx={{ fontSize: '0.72rem', fontWeight: 700, color }}>
          {value}%
        </Typography>
      </Box>
      <Box sx={{ height: 5, borderRadius: 3, bgcolor: alpha(color, 0.16), overflow: 'hidden' }}>
        <Box sx={{ height: '100%', width: `${Math.min(100, Math.max(0, value))}%`, bgcolor: color, borderRadius: 3, transition: 'width .3s ease' }} />
      </Box>
    </Box>
  );
}

/** Compact colored pill showing a single percentage stat (used in the dense list). */
export function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Box
      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.85, height: 22, borderRadius: 1.5, bgcolor: alpha(color, 0.12), flexShrink: 0 }}
    >
      <Typography component="span" sx={{ fontSize: '0.58rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.3px', lineHeight: 1 }}>
        {label}
      </Typography>
      <Typography component="span" sx={{ fontSize: '0.72rem', fontWeight: 800, color, lineHeight: 1 }}>
        {value}%
      </Typography>
    </Box>
  );
}
