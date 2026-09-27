'use client';

import type { ReactNode } from 'react';
import { Box, Paper, Typography, Skeleton, Chip } from '@neram/ui';
import type { User360, UserJourneyDetail } from '@neram/database';
import type { TimelineTone } from '@/lib/user360-view';

export interface User360TabProps {
  userId: string;
  data: User360;
  /** The older CRM detail payload the existing sections render from. Null only if it failed to load. */
  detail: UserJourneyDetail | null;
  adminId: string;
  adminName: string;
  /** Reload both payloads after an action. */
  onRefresh: () => void;
  /** Switch to another tab (used by "see all" links). */
  onNavigateTab?: (tab: string) => void;
  /** Something to focus once the tab has rendered: 'owner:<n>' or 'notes:<n>' on the CRM tab (n makes repeats fire). */
  focus?: string | null;
}

/** Visible keyboard focus and reduced motion for everything inside a User 360 or moderation screen. */
export const a11yRootSx = {
  '& :focus-visible': {
    outline: '2px solid',
    outlineColor: 'primary.main',
    outlineOffset: '2px',
    borderRadius: '4px',
  },
  '@media (prefers-reduced-motion: reduce)': {
    '& *, & *::before, & *::after': {
      animationDuration: '0.01ms !important',
      animationIterationCount: '1 !important',
      transitionDuration: '0.01ms !important',
      scrollBehavior: 'auto !important',
    },
  },
} as const;

export function SectionCard({
  title,
  icon,
  action,
  children,
  id,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <Paper
      id={id}
      component="section"
      aria-label={title}
      elevation={0}
      sx={{ border: '1px solid', borderColor: 'grey.200', borderRadius: 1, p: 2, mb: 2, minWidth: 0 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        {icon && <Box sx={{ display: 'flex', color: 'text.secondary' }} aria-hidden>{icon}</Box>}
        <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }}>
          {title}
        </Typography>
        {action}
      </Box>
      {children}
    </Paper>
  );
}

const TONE_COLORS: Record<TimelineTone, { fg: string; bg: string; border: string }> = {
  primary: { fg: 'primary.dark', bg: 'rgba(25,118,210,0.08)', border: 'rgba(25,118,210,0.3)' },
  success: { fg: 'success.dark', bg: 'rgba(46,125,50,0.08)', border: 'rgba(46,125,50,0.3)' },
  error: { fg: 'error.dark', bg: 'rgba(211,47,47,0.08)', border: 'rgba(211,47,47,0.3)' },
  warning: { fg: '#8a4b00', bg: 'rgba(237,108,2,0.1)', border: 'rgba(237,108,2,0.35)' },
  info: { fg: 'info.dark', bg: 'rgba(2,136,209,0.08)', border: 'rgba(2,136,209,0.3)' },
  neutral: { fg: 'text.primary', bg: 'grey.100', border: 'grey.300' },
};

export function toneColors(tone: TimelineTone) {
  return TONE_COLORS[tone] || TONE_COLORS.neutral;
}

/** A status is always an icon plus words, never colour alone. */
export function StatusChip({ icon, label, tone = 'neutral' }: { icon: ReactNode; label: string; tone?: TimelineTone }) {
  const c = toneColors(tone);
  return (
    <Chip
      icon={<Box component="span" sx={{ display: 'flex', color: `${c.fg} !important`, '& svg': { fontSize: 16 } }}>{icon}</Box>}
      label={label}
      size="small"
      sx={{
        height: 28,
        fontWeight: 600,
        fontSize: 12.5,
        color: c.fg,
        bgcolor: c.bg,
        border: '1px solid',
        borderColor: c.border,
        maxWidth: '100%',
        '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
      }}
    />
  );
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600 }}>
        {label}
      </Typography>
      <Box sx={{ fontSize: 14, color: empty ? 'text.secondary' : 'text.primary', wordBreak: 'break-word' }}>
        {empty ? 'Not set' : value}
      </Box>
    </Box>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
      {children}
    </Typography>
  );
}

export function TabSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Box aria-busy="true" aria-label="Loading" sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
      {Array.from({ length: rows * 2 }).map((_, i) => (
        <Skeleton key={i} variant="rounded" height={i % 2 ? 140 : 180} />
      ))}
    </Box>
  );
}

/** Two responsive columns that stack below the md breakpoint. */
export function TwoColumns({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0,1fr)', lg: 'minmax(0,1fr) minmax(0,1fr)' }, alignItems: 'start' }}>
      {children}
    </Box>
  );
}
