'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Box, Button, Chip, Skeleton, Stack, TableCell, TableRow, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

/** Header for a College Hub sub-page: back link, icon, title, one paragraph, actions. */
export function HubPageHeader({
  icon,
  title,
  description,
  actions,
  backHref = '/college-hub',
  backLabel = 'College Hub',
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <Box sx={{ mb: 3 }}>
      <Button
        component={Link}
        href={backHref}
        startIcon={<ArrowBackIcon />}
        size="small"
        sx={{ mb: 1, minHeight: 36, ml: -1 }}
      >
        {backLabel}
      </Button>
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} justifyContent="space-between" gap={2}>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <Box
            aria-hidden
            sx={{
              width: 42,
              height: 42,
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              borderRadius: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
          <Typography variant="h5" component="h1" fontWeight={700}>
            {title}
          </Typography>
        </Stack>
        {actions && (
          <Stack direction="row" gap={1} flexWrap="wrap">
            {actions}
          </Stack>
        )}
      </Stack>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, maxWidth: 820 }}>
          {description}
        </Typography>
      )}
    </Box>
  );
}

const TIER_COLOR: Record<string, 'default' | 'warning' | 'secondary' | 'info'> = {
  free: 'default',
  silver: 'info',
  gold: 'warning',
  platinum: 'secondary',
};

export function TierChip({ tier, size = 'small' }: { tier: string | null | undefined; size?: 'small' | 'medium' }) {
  const t = tier || 'free';
  return (
    <Chip
      size={size}
      label={t.charAt(0).toUpperCase() + t.slice(1)}
      color={TIER_COLOR[t] ?? 'default'}
      variant={t === 'free' ? 'outlined' : 'filled'}
      sx={{ fontWeight: 600 }}
    />
  );
}

/** Placeholder rows while a table loads. */
export function TableSkeletonRows({ rows = 5, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow key={r}>
          {Array.from({ length: cols }).map((__, c) => (
            <TableCell key={c}>
              <Skeleton variant="text" width={c === 0 ? '80%' : '60%'} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

/** "15 Oct 2026" from 'YYYY-MM-DD' or an ISO timestamp. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not yet';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: dateOnly ? 'UTC' : 'Asia/Kolkata',
  });
}

/** "15 Oct 2026, 3:40 pm" for timestamps. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Never';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}
