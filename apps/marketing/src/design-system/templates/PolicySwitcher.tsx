'use client';

import type { ReactNode } from 'react';
import { Box } from '@neram/ui';
import { Link } from '@/i18n/routing';
import { tokens as t } from '../tokens';

export interface PolicySwitcherProps {
  policies: Array<{ label: ReactNode; href: string; current?: boolean }>;
  ariaLabel?: string;
}

/** The T9 legal pill switcher: the current policy is a navy pill, the others outlined. */
export default function PolicySwitcher({ policies, ariaLabel = 'Policies' }: PolicySwitcherProps) {
  return (
    <Box component="nav" aria-label={ariaLabel} sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.75 }}>
      {policies.map((p) => (
        <Box
          key={p.href}
          component={Link}
          href={p.href}
          aria-current={p.current ? 'page' : undefined}
          sx={{
            minHeight: 44,
            display: 'inline-flex',
            alignItems: 'center',
            px: 1.75,
            boxSizing: 'border-box',
            borderRadius: `${t.radiusPill}px`,
            fontSize: '0.875rem',
            fontWeight: 600,
            textDecoration: 'none',
            ...(p.current
              ? { bgcolor: t.navy900, color: t.paper, border: `1px solid ${t.navy900}`, '&:hover': { color: t.paper } }
              : { bgcolor: t.surface, color: t.ink, border: `1px solid ${t.lineStrong}`, '&:hover': { borderColor: t.gold500, color: t.ink } }),
            '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
          }}
        >
          {p.label}
        </Box>
      ))}
    </Box>
  );
}
