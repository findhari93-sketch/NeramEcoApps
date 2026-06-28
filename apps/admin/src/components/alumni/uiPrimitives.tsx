'use client';

import { type ReactNode } from 'react';
import { Box, Typography, Paper } from '@neram/ui';
import { INK, MUTED, LINE, HEAD_BG } from './theme';

/** Outlined card with a small uppercase header bar and an optional header action. */
export function SectionCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, borderColor: LINE, mb: 2, overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.25,
          bgcolor: HEAD_BG,
          borderBottom: '1px solid',
          borderColor: LINE,
        }}
      >
        <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, color: MUTED }}>
          {title.toUpperCase()}
        </Typography>
        {action}
      </Box>
      <Box sx={{ p: 2 }}>{children}</Box>
    </Paper>
  );
}

/** Label (small uppercase, muted) over a value, with a "Not set" placeholder. */
export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: MUTED }}>
        {label.toUpperCase()}
      </Typography>
      <Typography variant="body2" color={INK}>
        {value || <span style={{ color: '#94A3B8' }}>Not set</span>}
      </Typography>
    </Box>
  );
}
