'use client';

import { Box, Paper, Typography } from '@mui/material';
import type { ReactNode } from 'react';

/** 15 Oct 2026 (India). Accepts YYYY-MM-DD or an ISO timestamp. */
export function formatDay(value: string | null | undefined): string {
  if (!value) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+05:30`) : new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

export function PageHeader({ title, intro, action }: { title: string; intro?: ReactNode; action?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 1.5, mb: 2.5 }}>
      <Box sx={{ minWidth: 0, flex: '1 1 320px' }}>
        <Typography variant="h1" sx={{ m: 0, fontSize: { xs: 22, sm: 26 }, fontWeight: 700, lineHeight: 1.25 }}>
          {title}
        </Typography>
        {intro && (
          <Typography component="div" sx={{ mt: 0.75, fontSize: 15, color: 'text.secondary', lineHeight: 1.55, maxWidth: 720 }}>
            {intro}
          </Typography>
        )}
      </Box>
      {action}
    </Box>
  );
}

export function Card({ children, sx }: { children: ReactNode; sx?: object }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 2, ...sx }}>
      {children}
    </Paper>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: ReactNode; action?: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 3, sm: 5 }, textAlign: 'center', borderRadius: 2 }}>
      <Box sx={{ color: 'text.disabled', mb: 1, '& svg': { fontSize: 44 } }}>{icon}</Box>
      <Typography sx={{ fontWeight: 700, fontSize: 17, mb: 0.5 }}>{title}</Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 15, maxWidth: 480, mx: 'auto' }}>{text}</Typography>
      {action && <Box sx={{ mt: 2 }}>{action}</Box>}
    </Paper>
  );
}

export const TIER_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  free: { bg: 'grey.200', fg: 'text.primary', label: 'Free listing' },
  silver: { bg: 'grey.700', fg: 'common.white', label: 'Silver plan' },
  gold: { bg: 'warning.dark', fg: 'common.white', label: 'Gold plan' },
  platinum: { bg: 'secondary.dark', fg: 'common.white', label: 'Platinum plan' },
};
